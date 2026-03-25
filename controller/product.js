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
    const products = await PRODUCT.find(query)
      .populate("category")
      .populate("sizes")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const INVENTORYITEM = require("../model/inventoryItem");
    const RETURN = require("../model/return");
    const ORDER_BOOKING = require("../model/orderBooking");

    const data = await Promise.all(products.map(async (p) => {
      const inStock = await INVENTORYITEM.countDocuments({ product: p._id, status: "In Stock", isDeleted: { $ne: true } });
      
      const reservedAgg = await ORDER_BOOKING.aggregate([
        { $match: { product: p._id, isDeleted: { $ne: true }, status: "Hold" } },
        { $group: { _id: null, total: { $sum: "$totalSets" } } },
      ]);
      const reservedCount = reservedAgg[0]?.total || 0;
      
      const returnAgg = await RETURN.aggregate([
        { $match: { product: p._id, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: "$qty" } } },
      ]);
      const returnQty = returnAgg[0]?.total || 0;
      // Sizes with count (based on In Stock barcodes + size-specific returns)
      const sizesWithCount = await Promise.all(
        (p.sizes || []).map(async (s) => {
          const sizeReturnAgg = await RETURN.aggregate([
            { $match: { product: p._id, size: s._id, isDeleted: { $ne: true } } },
            { $group: { _id: null, total: { $sum: "$qty" } } },
          ]);
          const sizeReturnQty = sizeReturnAgg[0]?.total || 0;
          return { ...s.toObject(), count: inStock + sizeReturnQty };
        })
      );

      // Use the minimum count across all sizes as the "Total Complete Sets"
      const allSizeCounts = sizesWithCount.map(s => s.count);
      const totalPhysicalStock = allSizeCounts.length > 0 ? Math.min(...allSizeCounts) : (inStock + returnQty);

      return { 
        ...p._doc, 
        sizes: sizesWithCount, 
        totalInStock: Math.max(0, totalPhysicalStock - reservedCount),
        totalReserved: reservedCount,
        totalCount: totalPhysicalStock
      };
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
