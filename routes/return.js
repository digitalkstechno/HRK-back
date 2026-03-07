var express = require("express");
var router = express.Router();
let {
  createReturn,
  fetchAllReturns,
  fetchReturnById,
  updateReturn,
  deleteReturn,
} = require("../controller/return");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createReturn);
router.get("/", authMiddleware, fetchAllReturns);
router.get("/:id", authMiddleware, fetchReturnById);
router.put("/:id", authMiddleware, updateReturn);
router.delete("/:id", authMiddleware, deleteReturn);

module.exports = router;
