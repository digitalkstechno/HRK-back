const express = require("express");
const router = express.Router();
const controller = require("../controller/dashboard");

router.get("/stats", controller.getDashboardStats);

module.exports = router;
