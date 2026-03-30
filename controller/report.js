const PRODUCT = require("../model/product");
const SIZEMASTER = require("../model/sizemaster");
const INVENTORYITEM = require("../model/inventoryItem");
const CATEGORY = require("../model/categorymaster");
const RETURN = require("../model/return");

// GET /report/stock
exports.getStockReport = async (req, res) => {
  try {
    const { search, category } = req.query;
    
    const productQuery = { isDeleted: { $ne: true } };
    if (category) productQuery.category = category;
    if (search) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const categoryIds = await CATEGORY.find({
            name: { $regex: escapedSearch, $options: "i" }
        }).distinct("_id");

        productQuery.$or = [
            { designNo: { $regex: escapedSearch, $options: "i" } },
            { sku: { $regex: escapedSearch, $options: "i" } },
            { productCode: { $regex: escapedSearch, $options: "i" } },
            { category: { $in: categoryIds } }
        ];
    }

    const products = await PRODUCT.find(productQuery)
      .populate("category")
      .populate("sizes")
      .sort({ designNo: 1 });

    const productIds = products.map(p => p._id);

    // 2. Fetch sizes for header:
    // We need both active sizes AND any sizes currently referenced by products being shown
    const activeSizes = await SIZEMASTER.find({ isDeleted: { $ne: true } });
    const inUseSizeIds = new Set();
    products.forEach(p => p.sizes.forEach(s => inUseSizeIds.add(s._id.toString())));
    
    // Find missing sizes (the ones in use but not in activeSizes)
    const activeSizeIds = new Set(activeSizes.map(s => s._id.toString()));
    const missingSizeIds = [...inUseSizeIds].filter(id => !activeSizeIds.has(id));
    
    let allSizes = [...activeSizes];
    if (missingSizeIds.length > 0) {
        const missingSizes = await SIZEMASTER.find({ _id: { $in: missingSizeIds } });
        allSizes = [...allSizes, ...missingSizes];
    }
    
    // Sort all sizes by defined order, then fallback to name
    allSizes.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    // 3. Aggregate Inventory by Product and Size
    // This is the source of truth used in Product page as well
    const invStats = await INVENTORYITEM.aggregate([
      { 
        $match: { 
          product: { $in: productIds }, 
          isDeleted: { $ne: true },
          status: { $in: ["In Stock", "Partial"] }
        } 
      },
      { $unwind: "$availableSizes" },
      {
        $group: {
          _id: { product: "$product", size: "$availableSizes" },
          count: { $sum: 1 }
        }
      }
    ]);

    const statsMap = {}; // key: productId_sizeId
    invStats.forEach(stat => {
      statsMap[`${stat._id.product}_${stat._id.size}`] = stat.count;
    });

    // 4. Transform into table rows
    const rows = products.map((p) => {
      const pid = p._id.toString();
      const productSizeIds = new Set(p.sizes.map((s) => s._id.toString()));
      
      const sizeCounts = {};
      allSizes.forEach((s) => {
        const sid = s._id.toString();
        // If product doesn't even have this size in its definition, show "-"
        if (!productSizeIds.has(sid)) {
          sizeCounts[sid] = null; 
        } else {
          // Get current physical count of this size for this product
          sizeCounts[sid] = statsMap[`${pid}_${sid}`] || 0;
        }
      });

      return { 
          designNo: p.designNo, 
          sku: p.sku, 
          category: p.category?.name || "-", 
          salePrice: p.salePrice,
          sizeCounts 
      };
    });

    res.status(200).json({ success: true, data: { sizes: allSizes, rows } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
