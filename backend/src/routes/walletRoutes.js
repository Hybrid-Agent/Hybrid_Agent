const express = require("express");
const { requireAuth } = require("../middleware/auth");
const ctrl = require("../controllers/walletController");

const router = express.Router();

router.use(requireAuth);
router.get("/", ctrl.get);
router.get("/key", ctrl.getKey);
router.post("/withdraw", ctrl.withdraw);
router.post("/fund-gas", ctrl.fundGas);

module.exports = router;
