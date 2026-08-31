// Soroban / Stellar indexer.
//
// Mirrors on-chain Soroban contract events into the document store, following
// the exact shape of the EVM indexer (backend/src/indexer/index.js):
//
//   - polls a ledger cursor on an interval
//   - reads contract events for the mandate registry + escrow
//   - upserts them into namespaced Stellar records
//
// It is entirely additive: it writes only to `db/soroban/*` (see the soroban
// models) and never touches EVM records. It starts in the "not configured"
// state until SOROBAN_* vars and the @stellar/stellar-sdk package are present,
// exactly like the EVM indexer's `chainConfigured` guard.
const config = require("../config/soroban");
const { getMeta, setMeta } = require("../config/db");
const sorobanDealModel = require("../models/sorobanDealModel");
const sorobanMandateModel = require("../models/sorobanMandateModel");

const LAST_LEDGER_KEY = `indexer:soroban:lastLedger`;

// Event payloads decoded into the same field shapes the models expect (mirrors
// how the EVM indexer parses deal/mandate events).

async function handleMandateEvent(name, args, meta) {
  if (name === "mandate_created" || name === "MandateCreated") {
    await sorobanMandateModel.upsertCreated({
      id: Number(args.mandate_id),
      owner: args.owner,
      agent: args.agent,
      listingRef: args.listing_ref,
      commissionBps: Number(args.commission_bps),
      expiry: Number(args.expiry),
      txHash: meta.txHash,
      ledger: meta.ledger,
    });
  } else if (name === "mandate_accepted" || name === "MandateAccepted") {
    await sorobanMandateModel.setStatus(Number(args.mandate_id), "accepted");
  } else if (name === "mandate_revoked" || name === "MandateRevoked") {
    await sorobanMandateModel.setStatus(Number(args.mandate_id), "revoked");
  }
}

async function handleEscrowEvent(name, args, meta) {
  if (name === "deal_created" || name === "DealCreated") {
    await sorobanDealModel.upsertCreated({
      id: Number(args.deal_id),
      listingRef: args.listing_ref,
      buyer: args.buyer,
      seller: args.seller,
      agent: args.agent || null,
      price: args.price.toString(),
      commissionBps: Number(args.commission_bps),
      platformFeeBps: Number(args.platform_fee_bps),
      mandateId: Number(args.mandate_id),
      txHash: meta.txHash,
      ledger: meta.ledger,
    });
  } else if (name === "deal_funded" || name === "DealFunded") {
    await sorobanDealModel.setState(Number(args.deal_id), "funded", Number(args.dispute_deadline));
  } else if (name === "deal_completed" || name === "DealCompleted") {
    await sorobanDealModel.setState(Number(args.deal_id), "completed");
  } else if (name === "deal_disputed" || name === "DealDisputed") {
    await sorobanDealModel.setState(Number(args.deal_id), "disputed");
  } else if (name === "deal_refunded" || name === "DealRefunded") {
    await sorobanDealModel.setState(Number(args.deal_id), "refunded");
  } else if (name === "deal_cancelled" || name === "DealCancelled") {
    await sorobanDealModel.setState(Number(args.deal_id), "cancelled");
  }
}

// Decode a Soroban contract event into (contractName, eventName, args, meta).
//
// `event` is a parsed event as returned by `@stellar/stellar-sdk` v17's
// `SorobanRpc.Server.getEvents()`. Each event has already had its topic and
// value XDR decoded into ScVal by `parseRawEvents`, so:
//   - event.topic[0]  -> ScVal symbol with the event name
//   - event.value     -> ScVal map  (field name -> ScVal value)
//   - event.contractId-> Contract object wrapping the emitting contract id
// `scValToNative` turns those ScVals into plain JS values (numbers, bigints,
// and G... address strings), so the model layer stays stable and SDK-version
// agnostic.
function decodeEvent(event) {
  const { scValToNative } = require("@stellar/stellar-sdk");

  const eventName = String(scValToNative(event.topic?.[0]) ?? "") || "";
  const raw = event.value ? scValToNative(event.value) || {} : {};

  const contractId = event.contractId ? String(event.contractId.toString()) : "";
  const contractName =
    contractId === config.hybridEscrowAddress ? "hybridEscrow" : "mandateRegistry";

  const base = {
    txHash: event.id || event.txHash || null,
    ledger: Number(event.ledger || 0),
  };

  return { contractName, eventName, data: raw, base };
}

// Map a decoded event payload onto the normalized {field: value} args the model
// handlers expect. `data` is already native JS (via scValToNative): prices are
// bigints, addresses are G... strings, ids are bigints/ints.
function toArgs(eventName, contractName, data) {
  const args = {};

  if (contractName === "hybridEscrow") {
    switch (eventName) {
      case "deal_created":
      case "DealCreated":
        args.deal_id = Number(data.deal_id ?? 0);
        args.buyer = data.buyer ?? "";
        args.seller = data.seller ?? "";
        args.agent = data.agent ?? "";
        args.price = data.price ?? 0n;
        args.commission_bps = Number(data.commission_bps ?? 0);
        args.platform_fee_bps = Number(data.platform_fee_bps ?? 0);
        args.mandate_id = Number(data.mandate_id ?? 0);
        args.listing_ref = data.listing_ref ? String(data.listing_ref) : "";
        break;
      case "deal_funded":
      case "DealFunded":
        args.deal_id = Number(data.deal_id ?? 0);
        args.funded_at = data.funded_at ?? 0n;
        args.dispute_deadline = data.dispute_deadline ?? 0n;
        break;
      case "deal_completed":
      case "DealCompleted":
      case "deal_disputed":
      case "DealDisputed":
      case "deal_refunded":
      case "DealRefunded":
      case "deal_cancelled":
      case "DealCancelled":
        args.deal_id = Number(data.deal_id ?? 0);
        if (data.timestamp !== undefined) args.timestamp = data.timestamp;
        break;
      default:
        break;
    }
  } else {
    switch (eventName) {
      case "mandate_created":
      case "MandateCreated":
        args.mandate_id = Number(data.mandate_id ?? 0);
        args.owner = data.owner ?? "";
        args.agent = data.agent ?? "";
        args.listing_ref = data.listing_ref ? String(data.listing_ref) : "";
        args.commission_bps = Number(data.commission_bps ?? 0);
        args.expiry = data.expiry ?? 0n;
        break;
      case "mandate_accepted":
      case "MandateAccepted":
      case "mandate_revoked":
      case "MandateRevoked":
        args.mandate_id = Number(data.mandate_id ?? 0);
        break;
      default:
        break;
    }
  }

  return args;
}

// Fetch events for a ledger range from the Stellar RPC and dispatch them.
// This is the Soroban analogue of the EVM indexer's queryFilter + parseLog loop.
async function syncRange(fromLedger, toLedger, rpc) {
  const response = await rpc.getEvents({
    startLedger: fromLedger,
    endLedger: toLedger,
    filters: [
      { type: "contract", contractIds: [config.hybridEscrowAddress] },
      { type: "contract", contractIds: [config.mandateRegistryAddress] },
    ],
    limit: 200,
  });

  for (const event of response.events || []) {
    const { contractName, eventName, data, base } = decodeEvent(event);
    const args = toArgs(eventName, contractName, data);
    if (!eventName || !Object.keys(args).length) continue;

    if (contractName === "hybridEscrow") {
      await handleEscrowEvent(eventName, args, base);
    } else {
      await handleMandateEvent(eventName, args, base);
    }
  }
}

async function tick(rpc) {
  const latest = await rpc.getLatestLedger();
  let from = Number((await getMeta(LAST_LEDGER_KEY, config.startLedger - 1))) + 1;
  if (from > latest.sequence) return;

  while (from <= latest.sequence) {
    const to = Math.min(from + config.indexerMaxRange - 1, latest.sequence);
    await syncRange(from, to, rpc);
    await setMeta(LAST_LEDGER_KEY, to);
    from = to + 1;
  }
}

function start() {
  if (!config.configured) {
    console.warn(
      "[soroban-indexer] not configured — set SOROBAN_* vars in .env to enable."
    );
    return;
  }
  if (!config.sdkAvailable()) {
    console.warn(`[soroban-indexer] ${config.sdkErrorMessage()}`);
    return;
  }

  // Build an RPC client lazily from the Stellar SDK so the indexer does not
  // crash on bootstrap when the SDK is present-but-misconfigured.
  const { rpc: sdkRpc } = require("@stellar/stellar-sdk");
  const rpc = new sdkRpc.Server(config.rpcUrl, {
    allowHttp: config.rpcUrl.startsWith("http://"),
  });

  let running = false;
  const loop = async () => {
    if (running) return;
    running = true;
    try {
      await tick(rpc);
    } catch (err) {
      console.error("[soroban-indexer] error:", err.message);
    } finally {
      running = false;
    }
  };

  loop();
  setInterval(loop, config.pollIntervalMs);
  console.log(
    `[soroban-indexer] polling every ${config.pollIntervalMs}ms from ledger ${config.startLedger}`
  );
}

module.exports = { start, decodeEvent, toArgs, handleEscrowEvent, handleMandateEvent };
