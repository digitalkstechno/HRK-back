var express = require("express");
var router = express.Router();

router.use("/health", require("./health"));
router.use("/staff", require("./staff"));
router.use("/sizemaster", require("./sizemaster"));
router.use("/product", require("./product"));
router.use("/customer", require("./customer"));
router.use("/stock", require("./stock"));
router.use("/billing", require("./billing"));
router.use("/return", require("./return"));
router.use("/saleorder", require("./saleOrder"));
router.use("/purchaseorder", require("./purchaseOrder"));
router.use("/categorymaster", require("./categorymaster"));
router.use("/transportmaster", require("./transportmaster"));



module.exports = router;
