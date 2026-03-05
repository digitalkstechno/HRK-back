var express = require("express");
var router = express.Router();
let {
  createStaff,
  loginStaff,
  fetchAllStaffs,
  fetchStaffById,
  staffUpdate,
  staffDelete,
  getCurrentStaff,
} = require("../controller/staff");
const authMiddleware = require("../middleware/auth");
const { authorize } = require("../middleware/permissions");

router.post("/create", createStaff);
router.post("/login", loginStaff);
router.get("/me", authMiddleware, getCurrentStaff);
router.get(
  "/",
  authMiddleware,
  authorize("setup", "readAll"),
  fetchAllStaffs,
);
router.get(
  "/:id",
  authMiddleware,
  authorize("setup", "readAll"),
  fetchStaffById,
);
router.put(
  "/:id",
  authMiddleware,
  authorize("setup", "update"),
  staffUpdate,
);
router.delete(
  "/:id",
  authMiddleware,
  authorize("setup", "delete"),
  staffDelete,
);
module.exports = router;
