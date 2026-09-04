const db = require("../config/filebaseDB");
const { v4: uuidv4 } = require("uuid");

const RECORDS = "db/purchase-requests/records/";
const LISTING_IDX = "db/purchase-requests/by-listing/";
const BUYER_IDX = "db/purchase-requests/by-buyer/";

function recordKey(listingId, buyerId) {
  return `${RECORDS}${listingId}/${buyerId}.json`;
}

async function syncIndexes(pr) {
  await Promise.all([
    db.put(`${LISTING_IDX}${pr.listing_id}/${pr.buyer_id}.json`, pr),
    db.put(`${BUYER_IDX}${pr.buyer_id}/${pr.listing_id}.json`, pr),
  ]);
}

async function getByListing(listingId) {
  const keys = await db.listKeys(`${RECORDS}${listingId}/`);
  const results = await Promise.all(keys.map((k) => db.get(k)));
  return results.filter(Boolean).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getByListingAndBuyer(listingId, buyerId) {
  return db.get(recordKey(listingId, buyerId));
}

async function create(listingId, buyerId, buyerAddress) {
  const key = recordKey(listingId, buyerId);
  const now = new Date().toISOString();
  const existing = await db.get(key);
  const pr = {
    id: existing?.id || uuidv4(),
    listing_id: listingId,
    buyer_id: buyerId,
    buyer_address: buyerAddress.toLowerCase(),
    deal_id: existing?.deal_id || null,
    status: "requested",
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  await db.put(key, pr);
  await syncIndexes(pr);
  return pr;
}

async function recordDeal(listingId, buyerId, dealId) {
  const key = recordKey(listingId, buyerId);
  const pr = await db.get(key);
  if (!pr) return null;
  pr.deal_id = dealId;
  pr.status = "deal_created";
  pr.updated_at = new Date().toISOString();
  await db.put(key, pr);
  await syncIndexes(pr);
  return pr;
}

async function approve(listingId, buyerId) {
  const key = recordKey(listingId, buyerId);
  const pr = await db.get(key);
  if (!pr) return null;
  pr.status = "approved";
  pr.updated_at = new Date().toISOString();
  await db.put(key, pr);
  await syncIndexes(pr);
  return pr;
}

// Upsert a purchase request row so a route can record a deal without requiring a
// prior explicit request step.
async function ensureForBuyer(listingId, buyerId, buyerAddress) {
  const existing = await getByListingAndBuyer(listingId, buyerId);
  if (existing) return existing;
  return create(listingId, buyerId, buyerAddress);
}

// Record a Soroban (Stellar rail) deal + funding hashes on the purchase request.
async function recordStellarDeal({ listingId, buyerId, dealId, method, hashes, xlmAmount, rate }) {
  const key = recordKey(listingId, buyerId);
  const pr = await db.get(key);
  if (!pr) return null;
  pr.deal_id = dealId;
  pr.status = "funded";
  pr.rail = "stellar";
  pr.stellar_method = method;
  pr.stellar_hashes = hashes;
  if (xlmAmount != null) pr.xlm_amount = xlmAmount;
  if (rate != null) pr.xlm_rate = rate;
  pr.updated_at = new Date().toISOString();
  await db.put(key, pr);
  await syncIndexes(pr);
  return pr;
}

async function markFunded(listingId, buyerAddress) {
  const keys = await db.listKeys(`${RECORDS}${listingId}/`);
  const all = await Promise.all(keys.map((k) => db.get(k)));
  const match = all.find((pr) => pr && pr.buyer_address === buyerAddress.toLowerCase());
  if (!match) return;
  match.status = "funded";
  match.updated_at = new Date().toISOString();
  await db.put(recordKey(listingId, match.buyer_id), match);
  await syncIndexes(match);
}

// Find a purchase request belonging to the buyer that matches this escrow deal.
async function getFundedForBuyerAndDeal(buyerId, dealId) {
  const keys = await db.listKeys(`${BUYER_IDX}${buyerId}/`);
  const all = await Promise.all(keys.map((k) => db.get(k)));
  return all.find((pr) => pr && pr.deal_id === dealId && pr.status === "funded") || null;
}

// Mark the buyer's purchase request for this escrow deal as funded (they've now
// sent funds for it). Updates any request whose listing matches this deal's
// listing reference when known, else any request with the matching deal_id.
async function markFundedByDeal(dealId, buyerId, buyerAddress) {
  // Purchase requests are keyed by listing, so find them via the buyer index.
  const buyerKeys = await db.listKeys(`${BUYER_IDX}${buyerId}/`);
  const all = await Promise.all(buyerKeys.map((k) => db.get(k)));
  const match = all.find((pr) => pr && pr.deal_id === dealId);
  if (!match) return;
  match.status = "funded";
  if (buyerAddress) match.buyer_address = String(buyerAddress).toLowerCase();
  match.updated_at = new Date().toISOString();
  await db.put(recordKey(match.listing_id, match.buyer_id), match);
  await syncIndexes(match);
  return match;
}

async function getIncomingForAgent(agentId) {
  const userModel = require("./userModel");

  // Scan all listing records directly (avoids depending on the by-creator index).
  const allListings = await db.getAll("db/listings/records/");
  const agentListings = allListings.filter((l) => l && String(l.created_by) === String(agentId));

  const results = [];
  for (const listing of agentListings) {
    // Use the RECORDS prefix directly — key = records/{listingId}/{buyerId}.json —
    // so listing-scoped lookup never depends on a secondary index.
    const prKeys = await db.listKeys(`${RECORDS}${listing.id}/`);
    const prs = await Promise.all(prKeys.map((k) => db.get(k)));

    for (const pr of prs.filter((p) => p && p.status !== "cancelled")) {
      const buyer = await userModel.findById(pr.buyer_id);
      results.push({
        ...pr,
        listing_title: listing.title,
        listing_image: listing.image,
        price_usdc: listing.price_usdc,
        commission_bps: listing.commission_bps,
        listing_ref: listing.listing_ref,
        listing_type: listing.listing_type,
        owner_address: listing.owner_address,
        agent_address: listing.agent_address,
        buyer_name: buyer?.full_name || null,
        buyer_avatar: buyer?.avatar || null,
      });
    }
  }
  return results.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

async function getByBuyer(buyerId) {
  const keys = await db.listKeys(`${BUYER_IDX}${buyerId}/`);
  const all = await Promise.all(keys.map((k) => db.get(k)));
  const filtered = all.filter((pr) => pr && !["funded", "cancelled"].includes(pr.status));

  return Promise.all(
    filtered.map(async (pr) => {
      const listing = await db.get(`db/listings/records/${pr.listing_id}.json`);
      return {
        ...pr,
        listing_title: listing?.title || null,
        listing_image: listing?.image || null,
        price_usdc: listing?.price_usdc || null,
      };
    })
  ).then((r) => r.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
}

module.exports = {
  getByListing,
  getByListingAndBuyer,
  create,
  approve,
  recordDeal,
  recordStellarDeal,
  ensureForBuyer,
  markFunded,
  markFundedByDeal,
  getFundedForBuyerAndDeal,
  getByBuyer,
  getIncomingForAgent,
};
