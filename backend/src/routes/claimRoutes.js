const express = require("express");
const ctrl = require("../controllers/claimController");

const router = express.Router();

router.get("/:listingId", ctrl.get);
// Owner approves the listing from the email link (no server-side auth — email magic-link is the guard).
router.patch("/:listingId/approve", ctrl.approve);

module.exports = router;
