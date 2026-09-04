const express = require("express");
const { requireAuth } = require("../middleware/auth");
const ctrl = require("../controllers/walletController");

const router = express.Router();

router.use(requireAuth);
router.get("/", ctrl.get);
router.post("/withdraw", ctrl.withdraw);
router.post("/fund-gas", ctrl.fundGas);
router.post("/escrow/fund-usdc-gas", ctrl.fundEscrowUsdcGas);
router.post("/stellar/activate", ctrl.stellarActivate);
router.post("/stellar/withdraw", ctrl.stellarWithdraw);

module.exports = router;
