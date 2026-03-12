var express = require("express");
var router = express.Router();
let {
  createCategoryMaster,
  fetchAllCategoryMasters,
  fetchCategoryMasterById,
  updateCategoryMaster,
  deleteCategoryMaster,
} = require("../controller/categorymaster");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createCategoryMaster);
router.get("/", authMiddleware, fetchAllCategoryMasters);
router.get("/:id", authMiddleware, fetchCategoryMasterById);
router.put("/:id", authMiddleware, updateCategoryMaster);
router.delete("/:id", authMiddleware, deleteCategoryMaster);

module.exports = router;
