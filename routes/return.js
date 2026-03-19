var express = require("express");
var router = express.Router();
const authMiddleware = require("../middleware/auth");
const {
  getProductsByFilter,
  createReturn,
  fetchAllReturns,
  fetchReturnById,
  deleteReturn,
} = require("../controller/return");

router.get("/products-by-filter", authMiddleware, getProductsByFilter);
router.post("/create", authMiddleware, createReturn);
router.get("/", authMiddleware, fetchAllReturns);
router.get("/:id", authMiddleware, fetchReturnById);
router.delete("/:id", authMiddleware, deleteReturn);

module.exports = router;
