const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const listingModel = require("../models/listingModel");
const purchaseModel = require("../models/purchaseModel");
const userModel = require("../models/userModel");
const stellarWallet = require("../services/stellarWallet");
const stellarPayments = require("../services/stellarPayments");

// POST /listings/:id/pay/stellar  (buyer auth)
// Buyer pays through the Stellar rail. `method` selects the asset:
//   'usdc' -> buyer's Stellar USDC (SAC) funds the Soroban escrow directly.
//   'xlm'  -> on-ramp: buyer sends XLM to the ops account, ops credits their
//            Stellar wallet with USDC, which then funds the escrow.
// The escrow settlement itself is always Circle USDC on Stellar (7 decimals).
const pay = asyncHandler(async (req, res) => {
  const listing = await listingModel.getById(req.params.id);
  if (!listing) throw ApiError.notFound("listing not found");
  if (listing.status !== "open") throw ApiError.badRequest("listing is not open");
  if (listing.created_by === req.user.id) throw ApiError.badRequest("cannot buy your own listing");
  if (!req.user.email) throw ApiError.badRequest("email is required to derive your Stellar wallet");

  const method = req.body?.method === "xlm" ? "xlm" : "usdc";
  if (method === "xlm" && !stellarPayments.opsConfigured()) {
    throw ApiError.badRequest("XLM payments are not enabled yet (ops account not configured)");
  }

  // Price / commission on the Stellar rail (USDC 7-dec base units).
  const priceUsdc6 = BigInt(Math.round(Number(listing.price_usdc) * 1e6));
  const priceUsdc7 = priceUsdc6 * 10n;
  const commissionBps = Number(listing.commission_bps || 0);
  const listingRef = String(listing.listing_ref || "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(listingRef)) {
    throw ApiError.badRequest("listing has no valid listing_ref");
  }

  // Seller must sign create_deal (escrow only lets seller/agent/admin create).
  // owner_direct -> seller is the listing creator; agent_brokered -> listing.owner_email.
  let sellerUser;
  if (listing.listing_type === "agent_brokered") {
    sellerUser = { email: listing.owner_email };
    if (!sellerUser.email) throw ApiError.badRequest("listing has no owner email for Stellar deal creation");
  } else {
    const creator = await userModel.findById(listing.created_by);
    sellerUser = creator || { email: listing.owner_email };
    if (!sellerUser?.email) throw ApiError.badRequest("cannot derive seller Stellar wallet");
  }

  // Agent address on Stellar: agent_brokered -> the listing agent's wallet;
  // owner_direct -> agent share is zero, so reuse the seller address.
  let agentPubkey;
  if (listing.listing_type === "agent_brokered") {
    const agent = await userModel.findById(listing.created_by);
    if (!agent?.email) throw ApiError.badRequest("cannot derive agent Stellar wallet");
    agentPubkey = stellarWallet.addressFor(agent);
  } else {
    agentPubkey = stellarWallet.addressFor(sellerUser);
  }

  const buyerUser = req.user;
  const payFn = method === "xlm" ? stellarPayments.payXlm : stellarPayments.payUsdc;
  const result = await payFn({
    buyerUser,
    sellerUser,
    agentPubkey,
    priceUsdc7: Number(priceUsdc7),
    listingRef,
    commissionBps,
  });

  // Record the deal + funding on the purchase request (rail = stellar).
  await purchaseModel.ensureForBuyer(listing.id, req.user.id, req.user.wallet_address);
  const pr = await purchaseModel.recordStellarDeal({
    listingId: listing.id,
    buyerId: req.user.id,
    dealId: result.dealId,
    method,
    hashes: {
      create: result.createHash,
      xlm: result.xlmHash || null,
      opsCredit: result.opsCreditHash || null,
      fund: result.fundHash,
    },
    xlmAmount: result.xlmAmount || null,
    rate: result.rate || null,
  });
  if (pr) await purchaseModel.markFunded(listing.id, pr.buyer_address);

  res.json({ ok: true, method, ...result, purchaseRequest: pr });
});

// GET /listings/:id/pay/stellar  (buyer auth) — quote for XLM before paying.
const quote = asyncHandler(async (req, res) => {
  const listing = await listingModel.getById(req.params.id);
  if (!listing) throw ApiError.notFound("listing not found");

  const priceUsdc6 = BigInt(Math.round(Number(listing.price_usdc) * 1e6));
  const priceUsdc7 = priceUsdc6 * 10n;
  res.json(stellarPayments.stellarQuote(Number(priceUsdc7)));
});

module.exports = { pay, quote };