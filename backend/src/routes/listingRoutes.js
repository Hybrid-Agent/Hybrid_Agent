const express = require("express");
const upload = require("../middleware/upload");
const validate = require("../middleware/validate");
const { requireAuth, requireKyc } = require("../middleware/auth");
const { createListingSchema, attachOwnerSchema } = require("../utils/validators");
const ctrl = require("../controllers/listingController");
const purchaseCtrl = require("../controllers/purchaseController");

const router = express.Router();

router.get("/", ctrl.list);
router.get("/mine", requireAuth, ctrl.mine);
router.get("/purchase-requests", requireAuth, purchaseCtrl.getMine);
router.get("/purchase-requests/incoming", requireAuth, purchaseCtrl.getIncoming);
router.get("/:id", ctrl.getOne);

// Creating a listing is a transacting action -> auth + KYC required.
// multer parses multipart/form-data (so req.body is populated) before validation.
router.post(
  "/",
  requireAuth,
  requireKyc,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'authDocs', maxCount: 5 }]),
  validate(createListingSchema),
  ctrl.create
);

// Attach the off-platform owner's payout address (just-in-time, before settlement).
router.patch("/:id/owner", requireAuth, validate(attachOwnerSchema), ctrl.attachOwner);

// Purchase request lifecycle (buyer → agent → buyer).
router.post("/:id/purchase", requireAuth, purchaseCtrl.request);
router.get("/:id/purchase", requireAuth, purchaseCtrl.get);
router.patch("/:id/purchase/approve", requireAuth, purchaseCtrl.approve);
router.patch("/:id/purchase", requireAuth, purchaseCtrl.recordDeal);

// Resend the owner notification email (agent triggers this if owner didn't receive it).
router.post("/:id/resend-notice", requireAuth, ctrl.resendOwnerNotice);

module.exports = router;
