const config = require("../config");
const { getMeta, setMeta } = require("../config/db");
const { provider, mandateRegistry, hybridEscrow } = require("../config/chain");
const mandateModel = require("../models/mandateModel");
const dealModel = require("../models/dealModel");
const listingModel = require("../models/listingModel");
const mailer = require("../services/mailer");

const LAST_BLOCK_KEY = `indexer:lastBlock:${String(config.hybridEscrowAddress).toLowerCase()}`;
const MAX_RANGE = config.indexerMaxRange;
const ZERO = "0x0000000000000000000000000000000000000000";

// Detect RPC rate-limit / transient errors so we can back off instead of
// aborting the whole sync (which otherwise leaves the cursor stuck and re-fires
// the same burst on every poll).
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1500;

function isThrottled(err) {
  const code = err?.code || err?.error?.code || err?.error?.error?.code;
  const msg = String(err?.message || err?.reason || "");
  return (
    code === 429 ||
    code === "RATE_LIMITED" ||
    /429|rate limit|rate-limit|compute units|too many requests|throttl/i.test(msg)
  );
}

async function withBackoff(fn) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isThrottled(err)) throw err;
      attempt += 1;
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(`[indexer] still rate-limited after ${MAX_ATTEMPTS} attempts: ${err.message}`);
      }
      const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + Math.random() * 500;
      console.warn(`[indexer] RPC rate-limited (attempt ${attempt}/${MAX_ATTEMPTS}), backing off ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function markListingForDeal(dealId, status) {
  const ref = await dealModel.listingRefFor(dealId);
  if (ref) await listingModel.setStatusByRef(ref, status);
}

// When the escrow releases funds, email the owner that they can claim.
async function notifyOwnerClaimReady(dealId) {
  try {
    const ref = await dealModel.listingRefFor(dealId);
    if (!ref) return;
    const listing = await listingModel.getByRef(ref);
    if (listing?.owner_email) {
      await mailer.sendClaimReady({ to: listing.owner_email, title: listing.title, listingId: listing.id });
    }
  } catch (err) {
    console.error("[indexer] claim-ready email failed:", err.message);
  }
}

async function handleMandateEvent(name, args, log) {
  if (name === "MandateCreated") {
    await mandateModel.upsertCreated({
      id: Number(args.id),
      owner: args.owner.toLowerCase(),
      agent: args.agent.toLowerCase(),
      listingRef: args.listingRef,
      commissionBps: Number(args.commissionBps),
      expiry: Number(args.expiry),
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
    });
  } else if (name === "MandateAccepted") {
    await mandateModel.setStatus(Number(args.id), "accepted");
  } else if (name === "MandateRevoked") {
    await mandateModel.setStatus(Number(args.id), "revoked");
  }
}

async function handleEscrowEvent(name, args, log) {
  if (name === "DealCreated") {
    await dealModel.upsertCreated({
      id: Number(args.id),
      listingRef: args.listingRef,
      buyer: args.buyer.toLowerCase(),
      seller: args.seller.toLowerCase(),
      agent: args.agent === ZERO ? null : args.agent.toLowerCase(),
      price: args.price.toString(),
      commissionBps: Number(args.commissionBps),
      platformFeeBps: Number(args.platformFeeBps),
      mandateId: Number(args.mandateId),
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
    });
  } else if (name === "DealFunded") {
    await dealModel.setState(Number(args.id), "funded", Number(args.disputeDeadline));
    await markListingForDeal(Number(args.id), "pending");
  } else if (name === "DealCompleted") {
    await dealModel.setState(Number(args.id), "completed");
    await markListingForDeal(Number(args.id), "sold");
    await notifyOwnerClaimReady(Number(args.id));
  } else if (name === "DealDisputed") {
    await dealModel.setState(Number(args.id), "disputed");
  } else if (name === "DealRefunded") {
    await dealModel.setState(Number(args.id), "refunded");
    await markListingForDeal(Number(args.id), "open");
  } else if (name === "DealCancelled") {
    await dealModel.setState(Number(args.id), "cancelled");
    await markListingForDeal(Number(args.id), "open");
  }
}

async function syncRange(fromBlock, toBlock) {
  const mandateLogs = await withBackoff(() =>
    mandateRegistry.queryFilter("*", fromBlock, toBlock)
  );
  const escrowLogs = await withBackoff(() =>
    hybridEscrow.queryFilter("*", fromBlock, toBlock)
  );

  for (const log of mandateLogs) {
    const parsed = mandateRegistry.interface.parseLog(log);
    if (parsed) await handleMandateEvent(parsed.name, parsed.args, log);
  }
  for (const log of escrowLogs) {
    const parsed = hybridEscrow.interface.parseLog(log);
    if (parsed) await handleEscrowEvent(parsed.name, parsed.args, log);
  }
}

async function tick() {
  const latest = await provider.getBlockNumber();
  let from = Number(await getMeta(LAST_BLOCK_KEY, config.startBlock - 1)) + 1;
  if (from > latest) return;

  while (from <= latest) {
    const to = Math.min(from + MAX_RANGE - 1, latest);
    await syncRange(from, to);
    await setMeta(LAST_BLOCK_KEY, to);
    from = to + 1;
  }
}

function start() {
  if (!config.chainConfigured) {
    console.warn("[indexer] chain not configured — skipping. Set contract addresses in .env to enable.");
    return;
  }

  let running = false;
  const loop = async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (err) {
      console.error("[indexer] error:", err.message);
    } finally {
      running = false;
    }
  };

  loop();
  setInterval(loop, config.pollIntervalMs);
  console.log(`[indexer] polling every ${config.pollIntervalMs}ms from block ${config.startBlock}`);
}

module.exports = { start };
