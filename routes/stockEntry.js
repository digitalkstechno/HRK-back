var express = require("express");
var router = express.Router();
const {
  createStockEntry,
  fetchAllStockEntries,
  getProductInventory,
  getStockEntryInventory,
  deleteStockEntry,
  fetchInventoryItems,
  markSizeLost,
  getBarcodeHistory
} = require("../controller/stockEntry");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createStockEntry);
router.get("/", authMiddleware, fetchAllStockEntries);
router.get("/inventory/items", authMiddleware, fetchInventoryItems);
router.get("/inventory/items/:id/history", authMiddleware, getBarcodeHistory);
router.patch("/inventory/items/:id/mark-lost", authMiddleware, markSizeLost);
router.get("/entry/:entryId", authMiddleware, getStockEntryInventory);
router.get("/product/:productId", authMiddleware, getProductInventory);
router.delete("/:id", authMiddleware, deleteStockEntry);

module.exports = router;
