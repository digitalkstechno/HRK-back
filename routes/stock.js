var express = require("express");
var router = express.Router();
let {
  createStock,
  fetchAllStocks,
  fetchStockById,
  updateStock,
  deleteStock,
} = require("../controller/stock");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createStock);
router.get("/", authMiddleware, fetchAllStocks);
router.get("/:id", authMiddleware, fetchStockById);
router.put("/:id", authMiddleware, updateStock);
router.delete("/:id", authMiddleware, deleteStock);

module.exports = router;
