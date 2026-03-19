const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { getStockReport } = require("../controller/report");

router.get("/stock", authMiddleware, getStockReport);

module.exports = router;
