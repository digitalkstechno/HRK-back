let PRODUCT = require("../model/product");

exports.createProduct = async (req, res) => {
  try {
    const { designNo, sku, category, purchasePrice, salePrice, sizes } = req.body;
    const productCode = `${designNo}-${sku}`;
    
    const product = await PRODUCT.create({ designNo, sku, productCode, category, purchasePrice, salePrice, sizes });
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
      isDeleted: { $ne: true },
      $or: [
        { designNo: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
      ],
    };

    const totalRecords = await PRODUCT.countDocuments(query);
    const INVENTORYITEM = require("../model/inventoryItem");
    const products = await PRODUCT.find(query)
      .populate("category")
      .populate("sizes")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Attach current stock count per product
    const data = await Promise.all(products.map(async (p) => {
      const inStockCount = await INVENTORYITEM.countDocuments({ 
        product: p._id, 
        status: "In Stock", 
        isDeleted: { $ne: true } 
      });
      return { ...p._doc, inStockCount };
    }));

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
    const product = await PRODUCT.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate("category")
      .populate("sizes");
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
    const { designNo, sku, category, purchasePrice, salePrice, sizes } = req.body;
    const productCode = `${designNo}-${sku}`;
    
    const product = await PRODUCT.findByIdAndUpdate(
      req.params.id,
      { designNo, sku, productCode, category, purchasePrice, salePrice, sizes },
      { new: true }
    ).populate("category").populate("sizes");
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
    const product = await PRODUCT.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Cascading soft delete for StockEntries and InventoryItems
    const STOCKENTRY = require("../model/stockEntry");
    const INVENTORYITEM = require("../model/inventoryItem");
    
    await STOCKENTRY.updateMany({ product: req.params.id }, { isDeleted: true });
    await INVENTORYITEM.updateMany({ product: req.params.id }, { isDeleted: true });

    res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
