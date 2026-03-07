var express = require("express");
var router = express.Router();
let {
  createSizeMaster,
  fetchAllSizeMasters,
  fetchSizeMasterById,
  updateSizeMaster,
  deleteSizeMaster,
} = require("../controller/sizemaster");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createSizeMaster);
router.get("/", authMiddleware, fetchAllSizeMasters);
router.get("/:id", authMiddleware, fetchSizeMasterById);
router.put("/:id", authMiddleware, updateSizeMaster);
router.delete("/:id", authMiddleware, deleteSizeMaster);

module.exports = router;
