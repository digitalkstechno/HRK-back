const PRODUCT = require("../model/product");
const SIZEMASTER = require("../model/sizemaster");
const INVENTORYITEM = require("../model/inventoryItem");
const RETURN = require("../model/return");

// GET /report/stock
exports.getStockReport = async (req, res) => {
  try {
    const allSizes = await SIZEMASTER.find({ isDeleted: { $ne: true } }).sort({ name: 1 });
    const products = await PRODUCT.find({ isDeleted: { $ne: true } })
      .populate("category")
      .populate("sizes")
      .sort({ designNo: 1 });

    // inventory In Stock count per product
    const invAgg = await INVENTORYITEM.aggregate([
      { $match: { status: "In Stock", isDeleted: { $ne: true } } },
      { $group: { _id: "$product", count: { $sum: 1 } } },
    ]);
    const invMap = {};
    invAgg.forEach((x) => { invMap[x._id.toString()] = x.count; });

    // return qty per product+size
    const retAgg = await RETURN.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: { product: "$product", size: "$size" }, qty: { $sum: "$qty" } } },
    ]);
    const retMap = {};
    retAgg.forEach((x) => {
      retMap[`${x._id.product}_${x._id.size}`] = x.qty;
    });

    const rows = products.map((p) => {
      const pid = p._id.toString();
      const productSizeIds = new Set(p.sizes.map((s) => s._id.toString()));
      const inStock = invMap[pid] || 0;
      const sizeCount = p.sizes.length || 1;

      const sizeCounts = {};
      allSizes.forEach((s) => {
        const sid = s._id.toString();
        if (!productSizeIds.has(sid)) {
          sizeCounts[sid] = null; // not applicable
        } else {
          const stockPerSize = Math.floor(inStock / sizeCount);
          const retQty = retMap[`${pid}_${sid}`] || 0;
          sizeCounts[sid] = stockPerSize + retQty;
        }
      });

      return { designNo: p.designNo, sku: p.sku, category: p.category?.name || "-", sizeCounts };
    });

    res.status(200).json({ success: true, data: { sizes: allSizes, rows } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
