var express = require("express");
var router = express.Router();
let {
  createTransportMaster,
  fetchAllTransportMasters,
  fetchTransportMasterById,
  updateTransportMaster,
  deleteTransportMaster,
} = require("../controller/transportmaster");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createTransportMaster);
router.get("/", authMiddleware, fetchAllTransportMasters);
router.get("/:id", authMiddleware, fetchTransportMasterById);
router.put("/:id", authMiddleware, updateTransportMaster);
router.delete("/:id", authMiddleware, deleteTransportMaster);

module.exports = router;
