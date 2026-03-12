var express = require("express");
var router = express.Router();
let {
  createTransportMaster,
  fetchAllTransportMasters,
  fetchTransportMasterById,
  updateTransportMaster,
  deleteTransportMaster,
  getTransportDropdown
} = require("../controller/transportmaster");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createTransportMaster);
router.get("/dropdown", authMiddleware, getTransportDropdown);
router.get("/", authMiddleware, fetchAllTransportMasters);
router.get("/:id", authMiddleware, fetchTransportMasterById);
router.put("/:id", authMiddleware, updateTransportMaster);
router.delete("/:id", authMiddleware, deleteTransportMaster);

module.exports = router;
