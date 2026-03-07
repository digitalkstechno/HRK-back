var express = require("express");
var router = express.Router();
let {
  createSaleOrder,
  fetchAllSaleOrders,
  fetchSaleOrderById,
  updateSaleOrder,
  deleteSaleOrder,
} = require("../controller/saleOrder");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createSaleOrder);
router.get("/", authMiddleware, fetchAllSaleOrders);
router.get("/:id", authMiddleware, fetchSaleOrderById);
router.put("/:id", authMiddleware, updateSaleOrder);
router.delete("/:id", authMiddleware, deleteSaleOrder);

module.exports = router;
