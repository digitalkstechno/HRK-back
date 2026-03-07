let PRODUCT = require("../model/product");

exports.createProduct = async (req, res) => {
  try {
    const { name, sku, category, purchasePrice, salePrice, barcode, sizes } = req.body;
    const product = await PRODUCT.create({ name, sku, category, purchasePrice, salePrice, barcode, sizes });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllProducts = async (req, res) => {
  try {
    const products = await PRODUCT.find().populate("sizes.size");
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchProductById = async (req, res) => {
  try {
    const product = await PRODUCT.findById(req.params.id).populate("sizes.size");
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { name, sku, category, purchasePrice, salePrice, barcode, sizes } = req.body;
    const product = await PRODUCT.findByIdAndUpdate(
      req.params.id,
      { name, sku, category, purchasePrice, salePrice, barcode, sizes },
      { new: true }
    ).populate("sizes.size");
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await PRODUCT.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
