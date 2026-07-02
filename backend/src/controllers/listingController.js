const { ethers } = require("ethers");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const config = require("../config");
const { uploadBuffer } = require("../config/filebase");
const listingModel = require("../models/listingModel");
const walletProvider = require("../services/walletProvider");
const mailer = require("../services/mailer");

// GET /listings
const list = asyncHandler(async (req, res) => {
  res.json(await listingModel.list({ assetType: req.query.assetType, status: req.query.status }));
});

// GET /listings/mine  (auth) — the signed-in agent's own listings (dashboard)
const mine = asyncHandler(async (req, res) => {
  res.json(await listingModel.listByCreator(req.user.id));
});

// GET /listings/:id
const getOne = asyncHandler(async (req, res) => {
  const listing = await listingModel.getById(req.params.id);
  if (!listing) throw ApiError.notFound("listing not found");
  res.json(listing);
});

// POST /listings  (auth + KYC required)
// The model is agent-led:
//   owner_direct   -> the authed user is the owner selling their own asset.
//                     owner_address = their wallet, no commission, owner_status 'self'.
//   agent_brokered -> the authed user is an AGENT helping an off-platform owner
//                     sell. agent_address = their wallet, commissionBps required.
//                     We capture who the owner is (name/contact); the owner's
//                     payout address is attached later (just-in-time) before the
//                     deal settles, so the contract pays the owner directly.
const create = asyncHandler(async (req, res) => {
  const b = req.body;
  const me = req.user;
  const brokered = b.listingType === "agent_brokered";

  let ownerAddress = null;
  let ownerName = null;
  let ownerEmail = null;
  let ownerContact = null;
  let ownerStatus = "pending";
  let agentAddress = null;
  let commissionBps = 0;

  if (brokered) {
    if (!b.commissionBps) throw ApiError.badRequest("commissionBps is required for agent_brokered listings");
    if (!b.ownerName) throw ApiError.badRequest("ownerName is required — who are you selling this for?");
    if (!b.ownerEmail) throw ApiError.badRequest("ownerEmail is required so we can reserve the owner's wallet");
    agentAddress = me.wallet_address.toLowerCase();
    commissionBps = b.commissionBps;
    ownerName = b.ownerName;
    ownerEmail = b.ownerEmail.toLowerCase();
    ownerContact = b.ownerContact || null;
    // Pre-generate the owner's smart wallet from their email (no login needed).
    const pre = await walletProvider.preGenerate(ownerEmail);
    ownerAddress = pre.address.toLowerCase();
    ownerStatus = "pending_verification";
  } else {
    // Owner selling their own asset.
    ownerAddress = me.wallet_address.toLowerCase();
    ownerStatus = "self";
  }

  if (req.files && !config.filebaseConfigured) {
    // If they uploaded either image or authDocs, but filebase is not configured
    const hasFiles = (req.files.image && req.files.image.length > 0) || (req.files.authDocs && req.files.authDocs.length > 0);
    if (hasFiles) throw ApiError.badRequest("file upload not available: Filebase is not configured");
  }

  let image = b.image || null;
  if (req.files && req.files.image && req.files.image.length > 0) {
    const file = req.files.image[0];
    image = await uploadBuffer(file.buffer, file.mimetype);
  }

  const authDocsUrls = [];
  if (req.files && req.files.authDocs && req.files.authDocs.length > 0) {
    for (const file of req.files.authDocs) {
      const url = await uploadBuffer(file.buffer, file.mimetype, "hybrid-agent/auth-docs");
      authDocsUrls.push(url);
    }
  }

  // listing_ref links this off-chain row to the on-chain mandate/deal.
  const listingRef = ethers.id(`hybridagent:listing:${ethers.hexlify(ethers.randomBytes(16))}`);

  const listing = await listingModel.create({
    listingRef,
    assetType: b.assetType,
    listingType: b.listingType,
    title: b.title,
    description: b.description,
    image,
    authDocs: authDocsUrls,
    priceUsdc: b.priceUsdc,
    ownerAddress,
    ownerName,
    ownerEmail,
    ownerContact,
    ownerStatus,
    agentAddress,
    commissionBps,
    createdBy: me.id,
  });

  // Notify the owner that their asset was listed + a wallet was reserved.
  if (ownerEmail) {
    try {
      await mailer.sendListingNotice({
        to: ownerEmail,
        ownerName,
        agentName: me.full_name,
        title: listing.title,
        listingId: listing.id,
      });
    } catch (err) {
      console.error("[mailer] listing notice failed:", err.message);
    }
  }

  res.status(201).json(listing);
});

// PATCH /listings/:id/owner  (auth required; must be the listing's agent)
// Attach the off-platform owner's payout address so the deal can settle to them.
const attachOwner = asyncHandler(async (req, res) => {
  const me = req.user;
  const listing = await listingModel.getById(req.params.id);
  if (!listing) throw ApiError.notFound("listing not found");
  if (listing.listing_type !== "agent_brokered") {
    throw ApiError.badRequest("owner payout can only be attached to agent-brokered listings");
  }
  if (listing.agent_address !== me.wallet_address.toLowerCase()) {
    throw ApiError.forbidden("only the listing agent can attach the owner");
  }
  const updated = await listingModel.attachOwner(req.params.id, req.body.ownerAddress);
  res.json(updated);
});

// POST /listings/:id/resend-notice (auth required; must be the listing's creator)
// Re-sends the owner notification email — useful when the first one was lost or email was down.
const resendOwnerNotice = asyncHandler(async (req, res) => {
  const me = req.user;
  const listing = await listingModel.getById(req.params.id);
  if (!listing) throw ApiError.notFound("listing not found");
  if (String(listing.created_by) !== String(me.id)) {
    throw ApiError.forbidden("only the listing agent can resend the notice");
  }
  if (!listing.owner_email) {
    throw ApiError.badRequest("this listing has no owner email on record");
  }

  await mailer.sendListingNotice({
    to: listing.owner_email,
    ownerName: listing.owner_name,
    agentName: me.full_name,
    title: listing.title,
    listingId: listing.id,
  });

  res.json({ ok: true, message: "notification email resent" });
});

module.exports = { list, mine, getOne, create, attachOwner, resendOwnerNotice };
