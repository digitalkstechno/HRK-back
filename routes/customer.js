var express = require("express");
var router = express.Router();
const multer = require("multer");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

let {
  createCustomer,
  fetchAllCustomers,
  fetchCustomerById,
  updateCustomer,
  deleteCustomer,
  fetchCustomerDropdown,
  bulkUploadCustomers,
  downloadSampleCustomerExcel
} = require("../controller/customer");
const authMiddleware = require("../middleware/auth");

router.post("/create", authMiddleware, createCustomer);
router.post("/bulk-upload", upload.single("file"), bulkUploadCustomers);
router.get("/download-sample", downloadSampleCustomerExcel);
router.get("/", authMiddleware, fetchAllCustomers);
router.get("/dropdown", authMiddleware, fetchCustomerDropdown);
router.get("/:id", authMiddleware, fetchCustomerById);
router.put("/:id", authMiddleware, updateCustomer);
router.delete("/:id", authMiddleware, deleteCustomer);

module.exports = router;
