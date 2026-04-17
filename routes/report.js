const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { getStockReport, getPendingStockReport, getPendingStockByProduct } = require("../controller/report");

router.get("/stock", authMiddleware, getStockReport);
router.get("/pending-stock", authMiddleware, getPendingStockReport);
router.get("/pending-stock-by-product/:productId", authMiddleware, getPendingStockByProduct);

module.exports = router;
