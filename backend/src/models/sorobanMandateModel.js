// Soroban (Stellar) mandate record model.
//
// Mirrors mandateModel.js but namespaced under `db/soroban/mandates/` so Stellar
// mandates never collide with EVM mandates. See sorobanDealModel.js for the
// multi-chain namespacing rationale.
const db = require("../config/filebaseDB");

const RECORDS = "db/soroban/mandates/records/";

async function list({ owner, agent, status } = {}) {
  const all = await db.getAll(RECORDS);
  return all
    .filter((m) => {
      if (owner && m.owner_address !== owner.toLowerCase()) return false;
      if (agent && m.agent_address !== agent.toLowerCase()) return false;
      if (status && m.status !== status) return false;
      return true;
    })
    .sort((a, b) => b.mandate_id - a.mandate_id);
}

async function getById(id) {
  return db.get(`${RECORDS}${id}.json`);
}

async function upsertCreated(m) {
  const existing = (await db.get(`${RECORDS}${m.id}.json`)) || {};
  const mandate = {
    ...existing,
    chain: "stellar",
    mandate_id: m.id,
    owner_address: m.owner && String(m.owner).toLowerCase(),
    agent_address: m.agent && String(m.agent).toLowerCase(),
    listing_ref: m.listingRef,
    commission_bps: m.commissionBps,
    expiry: m.expiry,
    status: "pending",
    tx_hash: m.txHash || null,
    ledger: m.ledger || null,
  };
  await db.put(`${RECORDS}${m.id}.json`, mandate);
}

async function setStatus(id, status) {
  const mandate = await db.get(`${RECORDS}${id}.json`);
  if (!mandate) return;
  mandate.status = status;
  await db.put(`${RECORDS}${id}.json`, mandate);
}

async function getByListingRef(listingRef) {
  const all = await db.getAll(RECORDS);
  const accepted = all
    .filter((m) => m.listing_ref === listingRef && m.status === "accepted")
    .sort((a, b) => b.mandate_id - a.mandate_id);
  return accepted[0] || null;
}

module.exports = { list, getById, upsertCreated, setStatus, getByListingRef, RECORDS };
