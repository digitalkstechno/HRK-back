const express = require("express");
const router = express.Router();
const supplierController = require("../controller/supplier");

router.post("/", supplierController.createSupplier);
router.get("/", supplierController.fetchAllSuppliers);
router.get("/dropdown", supplierController.fetchSupplierDropdown);
router.get("/:id", supplierController.fetchSupplierById);
router.put("/:id", supplierController.updateSupplier);
router.delete("/:id", supplierController.deleteSupplier);

module.exports = router;
