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

    const [totalRecords, products] = await Promise.all([
      PRODUCT.countDocuments(query),
      PRODUCT.find(query)
        .populate("category")
        .populate("sizes")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const productIds = products.map((p) => p._id);

    const INVENTORYITEM = require("../model/inventoryItem");
    const RETURN = require("../model/return");
    const ORDER_BOOKING = require("../model/orderBooking");

    // Gather all counts in bulk
    const [inStockCounts, reservedCounts, returnCounts, sizeReturnCounts] = await Promise.all([
      INVENTORYITEM.aggregate([
        { $match: { product: { $in: productIds }, status: "In Stock", isDeleted: { $ne: true } } },
        { $group: { _id: "$product", count: { $sum: 1 } } }
      ]),
      ORDER_BOOKING.aggregate([
        { $match: { product: { $in: productIds }, status: "Hold", isDeleted: { $ne: true } } },
        { $group: { _id: "$product", total: { $sum: "$totalSets" } } }
      ]),
      RETURN.aggregate([
        { $match: { product: { $in: productIds }, isDeleted: { $ne: true } } },
        { $group: { _id: "$product", total: { $sum: "$qty" } } }
      ]),
      RETURN.aggregate([
        { $match: { product: { $in: productIds }, isDeleted: { $ne: true } } },
        { $group: { _id: { product: "$product", size: "$size" }, total: { $sum: "$qty" } } }
      ])
    ]);

    const inStockMap = Object.fromEntries(inStockCounts.map(c => [c._id.toString(), c.count]));
    const reservedMap = Object.fromEntries(reservedCounts.map(c => [c._id.toString(), c.total]));
    const returnMap = Object.fromEntries(returnCounts.map(c => [c._id.toString(), c.total]));
    const sizeReturnMap = Object.fromEntries(sizeReturnCounts.map(c => [`${c._id.product}_${c._id.size}`, c.total]));

    const data = products.map((p) => {
      const pId = p._id.toString();
      const inStock = inStockMap[pId] || 0;
      const reservedCount = reservedMap[pId] || 0;
      const returnQty = returnMap[pId] || 0;

      const sizesWithCount = (p.sizes || []).map((s) => {
        const sizeReturnQty = sizeReturnMap[`${pId}_${s._id.toString()}`] || 0;
        return { ...s, count: inStock + sizeReturnQty };
      });

      const allSizeCounts = sizesWithCount.map(s => s.count);
      const totalPhysicalStock = allSizeCounts.length > 0 ? Math.min(...allSizeCounts) : (inStock + returnQty);

      return { 
        ...p, 
        sizes: sizesWithCount, 
        totalInStock: Math.max(0, totalPhysicalStock - reservedCount),
        totalReserved: reservedCount,
        totalCount: totalPhysicalStock
      };
    });

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

exports.fetchProductDropdown = async (req, res) => {
  try {
    const search = req.query.search || "";
    const query = {
      isDeleted: { $ne: true },
      $or: [
        { designNo: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
      ],
    };

    const data = await PRODUCT.find(query)
      .select("productCode designNo sku category sizes")
      .populate("category")
      .populate("sizes")
      .sort({ productCode: 1 })
      .lean();

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
