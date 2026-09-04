// Stellar / Soroban payment execution for the website checkout.
//
// Two rails share the SAME escrow semantics (escrow holds value; on completion
// splits agent commission / platform fee / seller remainder atomically):
//   - EVM rail:  existing createDeal/fundDeal on Ethereum Sepolia (USDC, 6 dec)
//   - Stellar:   this module — create_deal/fund_deal on the Soroban escrow
//                contract (Circle USDC on Stellar, 7 dec)
//
// Because the escrow stores one global settlement token (Circle USDC) and
// requires party auth for each call, the buyer/seller must have activated
// Stellar accounts (funded + USDC trustline). The "Pay with XLM" option works
// as an on-ramp: the buyer sends XLM to the platform ops account and the ops
// account credits the buyer's Stellar wallet with USDC, which then funds the
// escrow — every leg is an on-chain payment and the escrow splits exactly as
// the USDC path does. Ops keys come from SOROBAN_ADMIN_SECRET.
const { Keypair } = require("@stellar/stellar-sdk");
const config = require("../config/soroban");
const stellarWallet = require("./stellarWallet");

const INVOKE_FEE = "1000000"; // 1 XLM per tx (testnet default soroban fee)
const TX_TIMEOUT = 60; // seconds
const XLM_USDC_RATE = Number(process.env.SOROBAN_USDC_PER_XLM || 0.5);

function opsKeypair() {
  if (!config.adminSecret) return null;
  try {
    return Keypair.fromSecret(config.adminSecret);
  } catch {
    return null;
  }
}

function opsConfigured() {
  return Boolean(config.adminSecret && opsKeypair());
}

// Build a signed Soroban invocation through the standard flow:
// simulate -> assembleTransaction -> sign -> send -> poll.
// `sourceKeypair` is the account that must authorize the call (the contract does
// `caller.require_auth()` / `buyer.require_auth()`).
async function invoke({ contractId, method, args, sourceKeypair }) {
  const { Account, Operation, TransactionBuilder } = require("@stellar/stellar-sdk");
  const { rpc: sdkRpc } = require("@stellar/stellar-sdk");
  const rpc = new sdkRpc.Server(config.rpcUrl, {
    allowHttp: config.rpcUrl.startsWith("http://"),
  });

  const pubkey = sourceKeypair.publicKey();
  let source;
  try {
    const acc = await rpc.getAccount(pubkey);
    source = new Account(pubkey, acc.sequenceNumber());
  } catch {
    throw new Error(`Stellar account ${pubkey.slice(0, 10)}… is not funded on testnet — activate it first`);
  }

  // Soroban transactions do not support memos — omit memo entirely.
  const tx = new TransactionBuilder(source, {
    fee: INVOKE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: method,
        args,
      })
    )
    .setTimeout(TX_TIMEOUT)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (sim.error) {
    throw new Error(`soroban simulate ${method} failed: ${sim.error}`);
  }
  // assembleTransaction returns a TransactionBuilder in SDK v17; build() gives
  // the signable Transaction. sendTransaction accepts the Transaction object.
  const built = sdkRpc.assembleTransaction(tx, sim).build();
  built.sign(sourceKeypair);

  const sent = await rpc.sendTransaction(built);
  if (sent.status === "ERROR") {
    throw new Error(`soroban ${method}: ${sent.errorResult?.join(" | ") || "transaction rejected"}`);
  }
  const poll = await rpc.pollTransaction(sent.hash);
  if (poll.status !== "SUCCESS") {
    throw new Error(`soroban ${method}: tx ${sent.hash} status ${poll.status}`);
  }
  return { hash: sent.hash, ...poll };
}

// Small ScVal helpers (avoid importing xdr directly where the SDK sugar works).
function scvAddress(addr) {
  const { Address } = require("@stellar/stellar-sdk");
  return new Address(addr).toScVal();
}

function scvBytes32(hexStr) {
  const { nativeToScVal } = require("@stellar/stellar-sdk");
  const clean = hexStr.replace(/^0x/, "");
  const bytes = Buffer.from(clean, "hex");
  if (bytes.length !== 32) throw new Error(`listing_ref must be 32 bytes (got ${bytes.length})`);
  return nativeToScVal(bytes, { type: "bytes" });
}

function scvI128(n) {
  const { nativeToScVal } = require("@stellar/stellar-sdk");
  return nativeToScVal(Number(n), { type: "i128" });
}
function scvU64(n) {
  const { nativeToScVal } = require("@stellar/stellar-sdk");
  return nativeToScVal(Number(n), { type: "u64" });
}
function scvU32(n) {
  const { nativeToScVal } = require("@stellar/stellar-sdk");
  return nativeToScVal(Number(n), { type: "u32" });
}

// Create a Soroban escrow deal. `caller` must be the seller (or agent/admin):
// the escrow only allows the seller/agent/admin to create. So we sign with the
// listing seller's derived keypair.
async function createDeal({ sellerKp, buyerPubkey, agentPubkey, priceUsdc7, listingRef, commissionBps, mandateId = 0 }) {
  const result = await invoke({
    contractId: config.hybridEscrowAddress,
    method: "create_deal",
    args: [
      scvAddress(sellerKp.publicKey()),
      scvAddress(buyerPubkey),
      scvAddress(sellerKp.publicKey()),
      scvAddress(agentPubkey),
      scvI128(priceUsdc7),
      scvBytes32(listingRef),
      scvU32(commissionBps),
      scvU64(mandateId),
    ],
    sourceKeypair: sellerKp,
  });

  // The create_deal contract function returns the deal_id directly as u64.
  // Use result.returnValue (populated by the SDK from sorobanMeta.returnValue)
  // as the primary and most reliable source. Fall back to scanning contract
  // events only as a safety net for older SDK versions.
  const { scValToNative } = require("@stellar/stellar-sdk");
  let dealId = null;

  // Primary: function return value (u64 ScVal)
  if (result.returnValue != null) {
    try {
      dealId = Number(scValToNative(result.returnValue));
    } catch {
      /* fallthrough to event scan */
    }
  }

  // Fallback: scan contract events emitted by DealCreated.
  // The Stellar SDK returns events as an object { contractEventsXdr, transactionEventsXdr }
  // where contractEventsXdr is ContractEvent[][] (one inner array per tx).
  // deal_id is a *topic* on the DealCreated event, so it's in body().value().topics()[0].
  if (dealId == null) {
    const eventsObj = result.events ?? {};
    const contractEvents = Array.isArray(eventsObj)
      ? eventsObj // old flat format
      : (eventsObj.contractEventsXdr ?? []).flat(); // new nested format
    for (const ev of contractEvents) {
      try {
        // ContractEvent XDR: topics are in ev.body().value().topics()
        const topics = ev.body().value().topics();
        if (Array.isArray(topics) && topics.length > 0) {
          dealId = Number(scValToNative(topics[0]));
        }
      } catch {
        // Also try ev.data() for older event formats
        try {
          const native = scValToNative(ev.body().value().data());
          if (native && native.deal_id != null) dealId = Number(native.deal_id);
          else if (typeof native === "bigint" || typeof native === "number") dealId = Number(native);
        } catch { /* skip */ }
      }
      if (dealId != null) break;
    }
  }

  if (dealId == null) throw new Error("could not read deal_id from create_deal events");

  return { dealId, hash: result.hash };
}

// Buyer funds the deal (transfers USDC-on-Stellar from their wallet into the
// escrow). Requires the buyer's signature.
// Pre-flight: verify the buyer has enough USDC — gives a clear user-facing
// error instead of the opaque contract Error(Contract, #10) from the SAC.
async function fundDeal({ buyerKp, dealId, priceUsdc7 }) {
  if (priceUsdc7 != null) {
    const bal = await stellarWallet.getBalances(buyerKp.publicKey());
    if (BigInt(bal.usdcRaw || "0") < BigInt(priceUsdc7)) {
      throw new Error(
        `Buyer Stellar wallet has insufficient USDC to fund the deal. ` +
          `Required: ${Number(priceUsdc7) / 1e7} USDC, ` +
          `Available: ${Number(bal.usdcRaw || 0) / 1e7} USDC. ` +
          `Top up the wallet via the XLM on-ramp or deposit USDC directly.`
      );
    }
  }
  const result = await invoke({
    contractId: config.hybridEscrowAddress,
    method: "fund_deal",
    args: [scvU64(dealId)],
    sourceKeypair: buyerKp,
  });
  return { hash: result.hash };
}

// Activate both parties (friendbot funding + USDC trustline) so deal creation
// and funding can be signed on-chain.
async function ensureBothActivated(buyerUser, sellerUser) {
  if (!stellarWallet.configured()) throw new Error("Stellar rail not configured");
  const buyerKp = stellarWallet.keypairFor(buyerUser);
  const sellerKp = stellarWallet.keypairFor(sellerUser);
  const [buyerBal, sellerBal] = await Promise.all([stellarWallet.getBalances(buyerKp.publicKey()), stellarWallet.getBalances(sellerKp.publicKey())]);
  if (!buyerBal.funded) await stellarWallet.activate(buyerKp);
  if (!sellerBal.funded) await stellarWallet.activate(sellerKp);
  return { buyerKp, sellerKp };
}

// Pay with USDC on Stellar: create + fund the escrow deal (buyer's USDC).
async function payUsdc({ buyerUser, sellerUser, agentPubkey, priceUsdc7, listingRef, commissionBps }) {
  const { buyerKp, sellerKp } = await ensureBothActivated(buyerUser, sellerUser);

  // Pre-flight: ensure buyer has enough USDC before creating the deal.
  const buyerBal = await stellarWallet.getBalances(buyerKp.publicKey());
  if (BigInt(buyerBal.usdcRaw || "0") < BigInt(priceUsdc7)) {
    throw new Error(
      `Buyer Stellar wallet has insufficient USDC. ` +
        `Required: ${Number(priceUsdc7) / 1e7} USDC, ` +
        `Available: ${Number(buyerBal.usdcRaw || 0) / 1e7} USDC. ` +
        `Use the XLM payment option instead to auto-convert, or top up the wallet directly.`
    );
  }

  const deal = await createDeal({
    sellerKp,
    buyerPubkey: buyerKp.publicKey(),
    agentPubkey,
    priceUsdc7,
    listingRef,
    commissionBps,
  });
  const funded = await fundDeal({ buyerKp, dealId: deal.dealId, priceUsdc7 });
  return { dealId: deal.dealId, createHash: deal.hash, fundHash: funded.hash };
}

// Pay with XLM on Stellar (on-ramp): buyer -> ops (XLM), ops -> buyer wallet
// (USDC), buyer -> escrow (fund_deal). Every leg is on-chain; the escrow still
// settles atomically in USDC.
async function payXlm({ buyerUser, sellerUser, agentPubkey, priceUsdc7, listingRef, commissionBps }) {
  const ops = opsKeypair();
  if (!ops) throw new Error("XLM payments need SOROBAN_ADMIN_SECRET (ops account) configured");
  if (!stellarWallet.configured()) throw new Error("Stellar rail not configured");

  const { buyerKp, sellerKp } = await ensureBothActivated(buyerUser, sellerUser);
  const buyerPubkey = buyerKp.publicKey();

  // 1) create the deal (seller auth)
  const deal = await createDeal({
    sellerKp,
    buyerPubkey,
    agentPubkey,
    priceUsdc7,
    listingRef,
    commissionBps,
  });

  // 2) buyer pays XLM to ops (equivalent value at the demo rate)
  const xlmAmount = (priceUsdc7 / 1e7) / XLM_USDC_RATE;
  const xlmPay = await stellarWallet.transfer({
    keypair: buyerKp,
    to: ops.publicKey(),
    asset: "xlm",
    amountStr: String(xlmAmount),
  });

  // 3) ops credits the buyer's Stellar wallet with USDC (must have trustline)
  const usdcPay = await stellarWallet.transfer({
    keypair: ops,
    to: buyerPubkey,
    asset: "usdc",
    amountStr: String(priceUsdc7 / 1e7),
  });

  // Wait briefly for the Horizon classic payment to propagate to the Soroban
  // SAC ledger state before simulating fund_deal. On testnet, Horizon and
  // Soroban RPC are usually in sync within one ledger (~5 s) but we give it
  // a bit more to be safe.
  await new Promise((r) => setTimeout(r, 6000));

  // 4) buyer funds the escrow
  const funded = await fundDeal({ buyerKp, dealId: deal.dealId, priceUsdc7 });

  return {
    dealId: deal.dealId,
    createHash: deal.hash,
    xlmHash: xlmPay.hash,
    opsCreditHash: usdcPay.hash,
    fundHash: funded.hash,
    converted: true,
    xlmAmount: Number(xlmAmount.toFixed(7)),
    rate: XLM_USDC_RATE,
  };
}

function stellarQuote(priceUsdc7) {
  const xlm = (priceUsdc7 / 1e7) / XLM_USDC_RATE;
  return {
    priceUsdc7,
    xlmAmount: Number(xlm.toFixed(7)),
    rate: XLM_USDC_RATE,
    opsReady: opsConfigured(),
  };
}

module.exports = { invoke, createDeal, fundDeal, payUsdc, payXlm, stellarQuote, opsConfigured, opsKeypair, scvBytes32 };