var express = require("express");
var router = express.Router();
let {
  createPurchaseOrder,
  fetchAllPurchaseOrders,
  fetchPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
} = require("../controller/purchaseOrder");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createPurchaseOrder);
router.get("/", authMiddleware, fetchAllPurchaseOrders);
router.get("/:id", authMiddleware, fetchPurchaseOrderById);
router.put("/:id", authMiddleware, updatePurchaseOrder);
router.delete("/:id", authMiddleware, deletePurchaseOrder);

module.exports = router;
