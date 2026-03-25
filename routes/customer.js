var express = require("express");
var router = express.Router();
let {
  createCustomer,
  fetchAllCustomers,
  fetchCustomerById,
  updateCustomer,
  deleteCustomer,
  fetchCustomerDropdown,
} = require("../controller/customer");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createCustomer);
router.get("/", authMiddleware, fetchAllCustomers);
router.get("/dropdown", authMiddleware, fetchCustomerDropdown);
router.get("/:id", authMiddleware, fetchCustomerById);
router.put("/:id", authMiddleware, updateCustomer);
router.delete("/:id", authMiddleware, deleteCustomer);

module.exports = router;
