const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { 
  getStockReport, 
  getPendingStockReport, 
  getPendingStockByProduct,
  getSalesReport,
  getProductSalesReport,
  exportStockReport,
  exportPendingStockReport,
  exportSalesReport,
  exportProductSalesReport
} = require("../controller/report");

router.get("/stock", authMiddleware, getStockReport);
router.get("/stock/export", authMiddleware, exportStockReport);
router.get("/pending-stock", authMiddleware, getPendingStockReport);
router.get("/pending-stock/export", authMiddleware, exportPendingStockReport);
router.get("/pending-stock-by-product/:productId", authMiddleware, getPendingStockByProduct);
router.get("/sales", authMiddleware, getSalesReport);
router.get("/sales/export", authMiddleware, exportSalesReport);
router.get("/product-sales", authMiddleware, getProductSalesReport);
router.get("/product-sales/export", authMiddleware, exportProductSalesReport);

module.exports = router;
