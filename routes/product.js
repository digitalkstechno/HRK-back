var express = require("express");
var router = express.Router();
let {
  createProduct,
  fetchAllProducts,
  fetchProductById,
  updateProduct,
  deleteProduct,
  fetchProductDropdown,
} = require("../controller/product");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createProduct);
router.get("/", authMiddleware, fetchAllProducts);
router.get("/dropdown", authMiddleware, fetchProductDropdown);
router.get("/:id", authMiddleware, fetchProductById);
router.put("/:id", authMiddleware, updateProduct);
router.delete("/:id", authMiddleware, deleteProduct);

module.exports = router;
