const express = require("express");
const router = express.Router();
const controller = require("../controller/location");

router.get("/states", controller.getStates);
router.get("/cities", controller.getCitiesByState);
router.post("/add", controller.addLocation);

module.exports = router;
