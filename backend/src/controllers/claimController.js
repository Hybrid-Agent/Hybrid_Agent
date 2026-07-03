const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const listingModel = require("../models/listingModel");

// GET /claim/:listingId — minimal, public-safe context for the owner claim page.
// The owner authenticates with their email (magic link) on the frontend; the
// embedded wallet that opens deterministically maps to `ownerWallet`.
const get = asyncHandler(async (req, res) => {
  const listing = await listingModel.getById(req.params.listingId);
  if (!listing) throw ApiError.notFound("listing not found");
  if (listing.listing_type !== "agent_brokered") {
    throw ApiError.badRequest("this listing has no owner claim");
  }

  const price = BigInt(Math.round(Number(listing.price_usdc) * 1e6));
  const commission = (price * BigInt(listing.commission_bps || 0)) / 10000n;
  const platformFee = (price * 100n) / 10000n; // 1% default
  const payout = price - commission - platformFee;
  const fmt = (v) => (Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });

  res.json({
    listingId: listing.id,
    title: listing.title,
    image: listing.image,
    assetType: listing.asset_type,
    description: listing.description,
    status: listing.status, // open | pending | sold
    ownerStatus: listing.owner_status, // pending_verification | approved | confirmed
    ownerWallet: listing.owner_address,
    ownerEmail: listing.owner_email,
    ownerName: listing.owner_name,
    agentName: listing.agent_name,
    totalPriceUsdc: listing.price_usdc,
    commissionBps: listing.commission_bps,
    payoutUsdc: fmt(payout),
    commissionUsdc: fmt(commission),
    settled: listing.status === "sold",
  });
});

// PATCH /claim/:listingId/approve — owner approves the listing (confirms they
// authorised the agent to list their asset). No auth required beyond the email
// magic-link flow on the frontend; the listing's ownerEmail is the implicit guard.
const approve = asyncHandler(async (req, res) => {
  const listing = await listingModel.getById(req.params.listingId);
  if (!listing) throw ApiError.notFound("listing not found");
  if (listing.listing_type !== "agent_brokered") {
    throw ApiError.badRequest("only agent-brokered listings require owner approval");
  }
  if (listing.owner_status === "approved" || listing.owner_status === "confirmed") {
    return res.json({ ok: true, message: "already approved", ownerStatus: listing.owner_status });
  }
  const updated = await listingModel.approveListing(listing.id);
  res.json({ ok: true, ownerStatus: updated.owner_status });
});

module.exports = { get, approve };
