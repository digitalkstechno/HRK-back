var express = require("express");
var router = express.Router();
let {
  createMyStaff,
  fetchAllMyStaffs,
  fetchMyStaffById,
  updateMyStaff,
  deleteMyStaff,
  getMyStaffDropdown
} = require("../controller/mystaff");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createMyStaff);
router.get("/", authMiddleware, fetchAllMyStaffs);
router.get("/dropdown", authMiddleware, getMyStaffDropdown);
router.get("/:id", authMiddleware, fetchMyStaffById);
router.put("/:id", authMiddleware, updateMyStaff);
router.delete("/:id", authMiddleware, deleteMyStaff);

module.exports = router;
