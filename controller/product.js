let PRODUCT = require("../model/product");

exports.createProduct = async (req, res) => {
  try {
    const { name, sku, category, purchasePrice, salePrice, barcode, sizes } = req.body;
    
    // Check if SKU already exists
    const existingSKU = await PRODUCT.findOne({ sku });
    if (existingSKU) {
      return res.status(400).json({ success: false, message: "SKU already exists" });
    }
    
    // Check if barcode already exists
    const existingBarcode = await PRODUCT.findOne({ barcode });
    if (existingBarcode) {
      return res.status(400).json({ success: false, message: "Barcode already exists" });
    }
    
    const product = await PRODUCT.create({ name, sku, category, purchasePrice, salePrice, barcode, sizes });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      $or: [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { barcode: { $regex: search, $options: "i" } },
      ],
    };

    const totalRecords = await PRODUCT.countDocuments(query);
    const data = await PRODUCT.find(query)
      .populate("sizes.size")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data,
      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        limit,
      },
    });
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
    
    // Check if SKU already exists (excluding current product)
    const existingSKU = await PRODUCT.findOne({ sku, _id: { $ne: req.params.id } });
    if (existingSKU) {
      return res.status(400).json({ success: false, message: "SKU already exists" });
    }
    
    // Check if barcode already exists (excluding current product)
    const existingBarcode = await PRODUCT.findOne({ barcode, _id: { $ne: req.params.id } });
    if (existingBarcode) {
      return res.status(400).json({ success: false, message: "Barcode already exists" });
    }
    
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
