// Soroban (Stellar) deal record model.
//
// Mirrors dealModel.js but stores records under a separate `db/soroban/deals/`
// namespace so Stellar deals never collide with EVM deals (dealModel writes to
// `db/deals/records/`). This keeps the multi-chain story clean: each chain's
// on-chain records are namespaced, and consumer routes can either read one or
// merge across both.
const db = require("../config/filebaseDB");

const RECORDS = "db/soroban/deals/records/";

async function list({ buyer, seller, agent, state } = {}) {
  const all = await db.getAll(RECORDS);
  return all
    .filter((d) => {
      if (buyer && d.buyer_address !== buyer.toLowerCase()) return false;
      if (seller && d.seller_address !== seller.toLowerCase()) return false;
      if (agent && d.agent_address !== agent.toLowerCase()) return false;
      if (state && d.state !== state) return false;
      return true;
    })
    .sort((a, b) => b.deal_id - a.deal_id);
}

async function getById(id) {
  return db.get(`${RECORDS}${id}.json`);
}

async function upsertCreated(d) {
  const existing = (await db.get(`${RECORDS}${d.id}.json`)) || {};
  const deal = {
    ...existing,
    chain: "stellar",
    deal_id: d.id,
    listing_ref: d.listingRef,
    buyer_address: d.buyer && String(d.buyer).toLowerCase(),
    seller_address: d.seller && String(d.seller).toLowerCase(),
    agent_address: d.agent ? String(d.agent).toLowerCase() : null,
    price: d.price.toString(),
    commission_bps: d.commissionBps,
    platform_fee_bps: d.platformFeeBps,
    mandate_id: d.mandateId,
    state: "created",
    tx_hash: d.txHash || null,
    ledger: d.ledger || null,
    dispute_deadline: existing.dispute_deadline || null,
  };
  await db.put(`${RECORDS}${d.id}.json`, deal);
}

async function setState(id, state, disputeDeadline = null) {
  const deal = await db.get(`${RECORDS}${id}.json`);
  if (!deal) return;
  deal.state = state;
  if (disputeDeadline) deal.dispute_deadline = disputeDeadline;
  await db.put(`${RECORDS}${id}.json`, deal);
}

async function listingRefFor(dealId) {
  const deal = await db.get(`${RECORDS}${dealId}.json`);
  return deal?.listing_ref || null;
}

module.exports = { list, getById, upsertCreated, setState, listingRefFor, RECORDS };
