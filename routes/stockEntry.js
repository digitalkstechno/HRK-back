var express = require("express");
var router = express.Router();
const {
  createStockEntry,
  fetchAllStockEntries,
  getProductInventory,
  deleteStockEntry
} = require("../controller/stockEntry");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createStockEntry);
router.get("/", authMiddleware, fetchAllStockEntries);
router.get("/product/:productId", authMiddleware, getProductInventory);
router.delete("/:id", authMiddleware, deleteStockEntry);

module.exports = router;
