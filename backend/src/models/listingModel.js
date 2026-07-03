const db = require("../config/filebaseDB");
const { v4: uuidv4 } = require("uuid");

const RECORDS = "db/listings/records/";
const BY_CREATOR = "db/listings/by-creator/";
const BY_REF = "db/listings/by-ref/";

async function enrich(listing) {
  if (!listing) return null;
  // Lazy require to avoid circular deps at module load time.
  const userModel = require("./userModel");
  const reviewModel = require("./reviewModel");
  const [agent, stats] = await Promise.all([
    userModel.findById(listing.created_by),
    reviewModel.summary(listing.created_by),
  ]);
  return {
    ...listing,
    agent_name: agent?.full_name || null,
    agent_username: agent?.user_name || null,
    agent_phone: agent?.phone_number || null,
    agent_avatar: agent?.avatar || null,
    agent_kyc: agent?.kyc_status || null,
    agent_rating: stats?.rating || 0,
    agent_review_count: stats?.count || 0,
  };
}

async function list({ assetType, status } = {}) {
  const all = await db.getAll(RECORDS);
  let filtered = all.filter(Boolean);
  if (assetType) filtered = filtered.filter((l) => l.asset_type === assetType);
  if (status) filtered = filtered.filter((l) => l.status === status);
  filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return Promise.all(filtered.map(enrich));
}

async function listByCreator(userId) {
  const all = await db.getAll(RECORDS);
  const mine = all.filter((l) => l && String(l.created_by) === String(userId));
  const sorted = mine.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return Promise.all(sorted.map(enrich));
}

async function getById(id) {
  const listing = await db.get(`${RECORDS}${id}.json`);
  return enrich(listing);
}

async function getByRef(listingRef) {
  const idx = await db.get(`${BY_REF}${encodeURIComponent(listingRef)}.json`);
  if (!idx) return null;
  return getById(idx.id);
}

async function create(listing) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const record = {
    id,
    listing_ref: listing.listingRef,
    asset_type: listing.assetType,
    listing_type: listing.listingType,
    title: listing.title,
    description: listing.description || null,
    image: listing.image || null,
    auth_docs: listing.authDocs || [],
    price_usdc: String(listing.priceUsdc),
    owner_address: listing.ownerAddress || null,
    owner_name: listing.ownerName || null,
    owner_email: listing.ownerEmail || null,
    owner_contact: listing.ownerContact || null,
    owner_status: listing.ownerStatus || "pending",
    agent_address: listing.agentAddress || null,
    commission_bps: listing.commissionBps || 0,
    status: "open",
    created_by: listing.createdBy || null,
    created_at: now,
  };

  await db.put(`${RECORDS}${id}.json`, record);
  if (listing.createdBy) {
    await db.put(`${BY_CREATOR}${listing.createdBy}/${id}.json`, record);
  }
  if (listing.listingRef) {
    await db.put(`${BY_REF}${encodeURIComponent(listing.listingRef)}.json`, { id });
  }
  return getById(id);
}

async function attachOwner(id, ownerAddress) {
  const listing = await db.get(`${RECORDS}${id}.json`);
  if (!listing) return null;
  listing.owner_address = ownerAddress.toLowerCase();
  listing.owner_status = "confirmed";
  await db.put(`${RECORDS}${id}.json`, listing);
  if (listing.created_by) {
    await db.put(`${BY_CREATOR}${listing.created_by}/${id}.json`, listing);
  }
  return getById(id);
}

async function approveListing(id) {
  const listing = await db.get(`${RECORDS}${id}.json`);
  if (!listing) return null;
  listing.owner_status = "approved";
  await db.put(`${RECORDS}${id}.json`, listing);
  if (listing.created_by) {
    await db.put(`${BY_CREATOR}${listing.created_by}/${id}.json`, listing);
  }
  return getById(id);
}

// Used by the indexer to update listing status from on-chain events.
async function setStatusByRef(listingRef, status) {
  const idx = await db.get(`${BY_REF}${encodeURIComponent(listingRef)}.json`);
  if (!idx) return;
  const listing = await db.get(`${RECORDS}${idx.id}.json`);
  if (!listing) return;
  listing.status = status;
  await db.put(`${RECORDS}${idx.id}.json`, listing);
  if (listing.created_by) {
    await db.put(`${BY_CREATOR}${listing.created_by}/${idx.id}.json`, listing);
  }
}

module.exports = { list, listByCreator, getById, getByRef, create, attachOwner, approveListing, setStatusByRef };
