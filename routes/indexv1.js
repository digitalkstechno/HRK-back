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
router.use("/categorymaster", require("./categorymaster"));
router.use("/transportmaster", require("./transportmaster"));
router.use("/location", require("./location"));
router.use("/stock-entry", require("./stockEntry"));
router.use("/supplier", require("./supplier"));
router.use("/report", require("./report"));



module.exports = router;
