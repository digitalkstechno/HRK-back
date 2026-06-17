const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { 
  getStockReport, 
  getPendingStockReport, 
  getPendingStockByProduct,
  getSalesReport,
  getProductSalesReport
} = require("../controller/report");

router.get("/stock", authMiddleware, getStockReport);
router.get("/pending-stock", authMiddleware, getPendingStockReport);
router.get("/pending-stock-by-product/:productId", authMiddleware, getPendingStockByProduct);
router.get("/sales", authMiddleware, getSalesReport);
router.get("/product-sales", authMiddleware, getProductSalesReport);

module.exports = router;
