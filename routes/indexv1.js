var express = require("express");
var router = express.Router();

router.use("/dashboard", require("./dashboard"));
router.use("/billing", require("./billing"));
router.use("/return", require("./return"));
router.use("/health", require("./health"));
router.use("/location", require("./location"));
router.use("/categorymaster", require("./categorymaster"));
router.use("/transportmaster", require("./transportmaster"));
router.use("/stock-entry", require("./stockEntry"));
router.use("/supplier", require("./supplier"));
router.use("/report", require("./report"));



router.use("/customer", require("./customer"));
router.use("/product", require("./product"));
router.use("/sizemaster", require("./sizemaster"));
router.use("/staff", require("./staff"));
router.use("/stock", require("./stock"));
module.exports = router;
