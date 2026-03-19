var express = require("express");
var router = express.Router();
let {
  createBilling,
  fetchAllBillings,
  fetchBillingById,
  updateBilling,
  deleteBilling,
  scanBarcode,
  generatePackingSlip
} = require("../controller/billing");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createBilling);
router.get("/scan/:barcode", authMiddleware, scanBarcode);
router.get("/", authMiddleware, fetchAllBillings);
router.get("/:id", authMiddleware, fetchBillingById);
router.put("/:id", authMiddleware, updateBilling);
router.get("/:id/packing-slip", authMiddleware, generatePackingSlip);
router.delete("/:id", authMiddleware, deleteBilling);

module.exports = router;
