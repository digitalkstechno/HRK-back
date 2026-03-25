const express = require("express");
const router = express.Router();
const controller = require("../controller/orderBooking");
const auth = require("../middleware/auth");

router.post("/create", auth, controller.createOrderBooking);
router.get("/all", auth, controller.fetchAllOrderBookings);
router.put("/update/:id", auth, controller.updateOrderBooking);
router.delete("/delete/:id", auth, controller.deleteOrderBooking);

module.exports = router;
