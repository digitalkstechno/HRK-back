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

    // Aggregate inventory stats per product and per size
    const inventoryStats = await INVENTORYITEM.aggregate([
      { 
        $match: { 
          product: { $in: productIds }, 
          isDeleted: { $ne: true } 
        } 
      },
      { $unwind: "$availableSizes" },
      {
        $group: {
          _id: { product: "$product", size: "$availableSizes" },
          totalAvailable: { 
            $sum: { $cond: [{ $in: ["$status", ["In Stock", "Partial"]] }, 1, 0] } 
          },
          totalReserved: { 
            $sum: { $cond: [{ $eq: ["$status", "Reserved"] }, 1, 0] } 
          }
        }
      }
    ]);

    const ORDER_BOOKING = require("../model/orderBooking");
    const posReservations = await ORDER_BOOKING.aggregate([
        { $match: { product: { $in: productIds }, isDeleted: { $ne: true }, status: "Hold" } },
        { $group: { _id: "$product", total: { $sum: "$totalSets" } } }
    ]);
    const posResMap = Object.fromEntries(posReservations.map(r => [r._id.toString(), r.total]));

    const statsMap = {}; // key: productId_sizeId
    inventoryStats.forEach(stat => {
      statsMap[`${stat._id.product}_${stat._id.size}`] = {
        available: stat.totalAvailable,
        reserved: stat.totalReserved
      };
    });

    const data = products.map((p) => {
      const pId = p._id.toString();
      
      let totalAvailableAcrossSizes = 0;
      let totalReservedAcrossSizes = 0;

      const sizesWithCount = (p.sizes || []).map((s) => {
        const stats = statsMap[`${pId}_${s._id.toString()}`] || { available: 0, reserved: 0 };
        totalAvailableAcrossSizes += stats.available;
        totalReservedAcrossSizes += stats.reserved;

        return { 
            ...s, 
            count: stats.available, // This is what is shown as 'M: 34' etc.
            reservedCount: stats.reserved 
        };
      });

      // Calculate 'Total Sets' conceptually. 
      // If we have partials, it's hard to define a 'set'. 
      // We'll use the minimum available of any size that was intended for this product.
      const allCounts = sizesWithCount.map(s => s.count);
      const physicalMin = allCounts.length > 0 ? Math.min(...allCounts) : 0;
      
      const posReservedSets = posResMap[pId] || 0;
      const finalAvailableSets = Math.max(0, physicalMin - posReservedSets);

      return { 
        ...p, 
        sizes: sizesWithCount, 
        totalInStock: totalAvailableAcrossSizes, // Raw sum of pieces
        totalReserved: totalReservedAcrossSizes + (posReservedSets * (p.sizes?.length || 0)),
        availableSets: finalAvailableSets // Best estimation of full sets
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
