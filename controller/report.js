const PRODUCT = require("../model/product");
const SIZEMASTER = require("../model/sizemaster");
const INVENTORYITEM = require("../model/inventoryItem");
const CATEGORY = require("../model/categorymaster");
const RETURN = require("../model/return");
const STOCKENTRY = require("../model/stockEntry");
const BILLING = require("../model/billing");
const mongoose = require("mongoose");

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

    // In-memory sort: rows with totalQty > 0 first, totalQty === 0 last.
    rows.sort((a, b) => {
      const aQty = Object.values(a.sizeCounts).reduce((sum, val) => sum + (val || 0), 0);
      const bQty = Object.values(b.sizeCounts).reduce((sum, val) => sum + (val || 0), 0);
      
      const aHasStock = aQty > 0 ? 1 : 0;
      const bHasStock = bQty > 0 ? 1 : 0;
      
      if (aHasStock !== bHasStock) {
        return bHasStock - aHasStock; // 1 (has stock) comes first, 0 (no stock) last
      }
      
      // Preserve designNo: 1 sorting order using localeCompare
      return a.designNo.localeCompare(b.designNo, undefined, { numeric: true, sensitivity: 'base' });
    });

    res.status(200).json({ success: true, data: { sizes: allSizes, rows } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /report/pending-stock
exports.getPendingStockReport = async (req, res) => {
  try {
    const { search } = req.query;

    const query = {
      isDeleted: { $ne: true },
      pendingQuantity: { $gt: 0 },
      linkedPendingEntryId: null  // Only root entries
    };

    if (search) {
      const matchingProducts = await PRODUCT.find({
        isDeleted: { $ne: true },
        $or: [
          { designNo: { $regex: search, $options: "i" } },
          { sku: { $regex: search, $options: "i" } },
          { productCode: { $regex: search, $options: "i" } },
        ]
      }).select("_id");

      const productIds = matchingProducts.map(p => p._id);
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { product: { $in: productIds } }
      ];
    }

    const pendingEntries = await STOCKENTRY.find(query)
      .populate({ path: "product", populate: { path: "sizes category" } })
      .populate("supplier")
      .sort({ entryDate: -1 });

    // Fetch history (child entries) for each root entry
    const entryIds = pendingEntries.map(e => e._id);
    const childEntries = await STOCKENTRY.find({
      linkedPendingEntryId: { $in: entryIds },
      isDeleted: { $ne: true }
    }).sort({ createdAt: 1 });

    const childMap = {};
    childEntries.forEach(c => {
      const key = c.linkedPendingEntryId.toString();
      if (!childMap[key]) childMap[key] = [];
      childMap[key].push({
        _id: c._id,
        entryDate: c.entryDate,
        totalSets: c.totalSets,
        invoiceNumber: c.invoiceNumber,
        createdAt: c.createdAt
      });
    });

    const enriched = pendingEntries.map(e => ({
      ...e.toObject(),
      history: childMap[e._id.toString()] || []
    }));

    const summary = {
      totalPendingEntries: enriched.length,
      totalPendingSets: enriched.reduce((sum, e) => sum + e.pendingQuantity, 0),
      totalExpectedSets: enriched.reduce((sum, e) => sum + e.expectedSets, 0),
      totalReceivedSets: enriched.reduce((sum, e) => sum + e.totalSets, 0)
    };

    res.status(200).json({ success: true, data: enriched, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /report/pending-stock-by-product/:productId
exports.getPendingStockByProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const pendingEntries = await STOCKENTRY.find({
      product: productId,
      isDeleted: { $ne: true },
      pendingQuantity: { $gt: 0 },
      linkedPendingEntryId: null  // Only root entries
    })
      .populate("supplier")
      .sort({ entryDate: -1 });

    const totalPending = pendingEntries.reduce((sum, e) => sum + e.pendingQuantity, 0);

    res.status(200).json({ 
      success: true, 
      data: pendingEntries,
      totalPending
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /report/sales
exports.getSalesReport = async (req, res) => {
  try {
    const { year, startDate, endDate, customerId } = req.query;
    let matchQuery = { isDeleted: { $ne: true } };

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        matchQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = end;
      }
    } else if (year) {
      const startYear = new Date(`${year}-01-01T00:00:00.000Z`);
      const endYear = new Date(`${parseInt(year) + 1}-01-01T00:00:00.000Z`);
      matchQuery.createdAt = { $gte: startYear, $lt: endYear };
    }

    if (customerId) {
      matchQuery.customer = new mongoose.Types.ObjectId(customerId);
    }

    const monthlySales = await BILLING.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "+05:30" }
          },
          totalAmount: { $sum: "$totalAmount" },
          totalSubtotal: { $sum: "$subtotal" },
          billCount: { $sum: 1 },
          totalQty: { $sum: { $sum: "$items.qty" } }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    const summaryAgg = await BILLING.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          grandTotalAmount: { $sum: "$totalAmount" },
          grandTotalSubtotal: { $sum: "$subtotal" },
          totalBills: { $sum: 1 },
          totalQty: { $sum: { $sum: "$items.qty" } }
        }
      }
    ]);

    const summary = summaryAgg[0] || {
      grandTotalAmount: 0,
      grandTotalSubtotal: 0,
      totalBills: 0,
      totalQty: 0
    };

    res.status(200).json({
      success: true,
      data: {
        monthlySales,
        summary
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /report/product-sales
exports.getProductSalesReport = async (req, res) => {
  try {
    const { search, category, startDate, endDate, month, customerId } = req.query;
    
    let matchQuery = { isDeleted: { $ne: true } };
    
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        matchQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = end;
      }
    } else if (month) {
      const [y, m] = month.split("-").map(Number);
      const startMonth = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      const endMonth = new Date(Date.UTC(y, m, 1, 0, 0, 0));
      matchQuery.createdAt = { $gte: startMonth, $lt: endMonth };
    }

    if (customerId) {
      matchQuery.customer = new mongoose.Types.ObjectId(customerId);
    }

    const pipeline = [
      { $match: matchQuery },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          productName: { $first: "$items.productName" },
          totalQty: { $sum: "$items.qty" },
          totalRevenue: { $sum: "$items.total" },
          avgPrice: { $avg: "$items.price" }
        }
      }
    ];

    pipeline.push({
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productDetails"
      }
    });

    pipeline.push({
      $unwind: {
        path: "$productDetails",
        preserveNullAndEmptyArrays: true
      }
    });

    if (category) {
      pipeline.push({
        $match: {
          "productDetails.category": new mongoose.Types.ObjectId(category)
        }
      });
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pipeline.push({
        $match: {
          $or: [
            { productName: { $regex: escapedSearch, $options: "i" } },
            { "productDetails.designNo": { $regex: escapedSearch, $options: "i" } },
            { "productDetails.sku": { $regex: escapedSearch, $options: "i" } },
            { "productDetails.productCode": { $regex: escapedSearch, $options: "i" } }
          ]
        }
      });
    }

    pipeline.push({
      $lookup: {
        from: "categorymasters",
        localField: "productDetails.category",
        foreignField: "_id",
        as: "categoryDetails"
      }
    });

    pipeline.push({
      $unwind: {
        path: "$categoryDetails",
        preserveNullAndEmptyArrays: true
      }
    });

    pipeline.push({
      $project: {
        _id: 1,
        productName: 1,
        designNo: { $ifNull: ["$productDetails.designNo", "N/A"] },
        sku: { $ifNull: ["$productDetails.sku", "N/A"] },
        productCode: { $ifNull: ["$productDetails.productCode", "N/A"] },
        category: { $ifNull: ["$categoryDetails.name", "N/A"] },
        totalQty: 1,
        totalRevenue: 1,
        avgPrice: 1
      }
    });

    pipeline.push({ $sort: { totalQty: -1 } });

    const productSales = await BILLING.aggregate(pipeline);

    res.status(200).json({
      success: true,
      data: productSales
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper function to escape special characters in CSV fields
const escapeCSV = (val) => {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// GET /report/stock/export
exports.exportStockReport = async (req, res) => {
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

    const activeSizes = await SIZEMASTER.find({ isDeleted: { $ne: true } });
    const inUseSizeIds = new Set();
    products.forEach(p => p.sizes.forEach(s => inUseSizeIds.add(s._id.toString())));
    
    const activeSizeIds = new Set(activeSizes.map(s => s._id.toString()));
    const missingSizeIds = [...inUseSizeIds].filter(id => !activeSizeIds.has(id));
    
    let allSizes = [...activeSizes];
    if (missingSizeIds.length > 0) {
        const missingSizes = await SIZEMASTER.find({ _id: { $in: missingSizeIds } });
        allSizes = [...allSizes, ...missingSizes];
    }
    
    allSizes.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

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

    const statsMap = {};
    invStats.forEach(stat => {
      statsMap[`${stat._id.product}_${stat._id.size}`] = stat.count;
    });

    const rows = products.map((p) => {
      const pid = p._id.toString();
      const productSizeIds = new Set(p.sizes.map((s) => s._id.toString()));
      
      const sizeCounts = {};
      allSizes.forEach((s) => {
        const sid = s._id.toString();
        if (!productSizeIds.has(sid)) {
          sizeCounts[sid] = null; 
        } else {
          sizeCounts[sid] = statsMap[`${pid}_${sid}`] || 0;
        }
      });

      return { 
          designNo: p.designNo, 
          sku: p.sku, 
          category: p.category?.name || "-", 
          sizeCounts 
      };
    });

    rows.sort((a, b) => {
      const aQty = Object.values(a.sizeCounts).reduce((sum, val) => sum + (val || 0), 0);
      const bQty = Object.values(b.sizeCounts).reduce((sum, val) => sum + (val || 0), 0);
      
      const aHasStock = aQty > 0 ? 1 : 0;
      const bHasStock = bQty > 0 ? 1 : 0;
      
      if (aHasStock !== bHasStock) {
        return bHasStock - aHasStock;
      }
      return a.designNo.localeCompare(b.designNo, undefined, { numeric: true, sensitivity: 'base' });
    });

    const headers = ["Design No", "SKU", "Category", ...allSizes.map((s) => s.name)];
    const csvRows = rows.map((r) =>
      [
        escapeCSV(r.designNo),
        escapeCSV(r.sku),
        escapeCSV(r.category),
        ...allSizes.map((s) => (r.sizeCounts[s._id] === null ? "-" : r.sizeCounts[s._id])),
      ].join(",")
    );
    const csvContent = [headers.join(","), ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="stock-report-${new Date().toISOString().split("T")[0]}.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /report/pending-stock/export
exports.exportPendingStockReport = async (req, res) => {
  try {
    const { search } = req.query;

    const query = {
      isDeleted: { $ne: true },
      pendingQuantity: { $gt: 0 },
      linkedPendingEntryId: null
    };

    if (search) {
      const matchingProducts = await PRODUCT.find({
        isDeleted: { $ne: true },
        $or: [
          { designNo: { $regex: search, $options: "i" } },
          { sku: { $regex: search, $options: "i" } },
          { productCode: { $regex: search, $options: "i" } },
        ]
      }).select("_id");

      const productIds = matchingProducts.map(p => p._id);
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { product: { $in: productIds } }
      ];
    }

    const pendingEntries = await STOCKENTRY.find(query)
      .populate({ path: "product", populate: { path: "sizes category" } })
      .populate("supplier")
      .sort({ entryDate: -1 });

    const headers = ["Date", "Supplier", "Invoice", "Product Code", "Expected Sets", "Received Sets", "Pending Sets"];
    const csvRows = pendingEntries.map((e) =>
      [
        new Date(e.entryDate).toLocaleDateString("en-GB"),
        escapeCSV(e.supplier?.name || "-"),
        escapeCSV(e.invoiceNumber || "-"),
        escapeCSV(e.product?.productCode || "-"),
        e.expectedSets,
        e.totalSets,
        e.pendingQuantity
      ].join(",")
    );
    const csvContent = [headers.join(","), ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="pending-factory-orders-${new Date().toISOString().split("T")[0]}.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /report/sales/export
exports.exportSalesReport = async (req, res) => {
  try {
    const { year, startDate, endDate, customerId } = req.query;
    let matchQuery = { isDeleted: { $ne: true } };

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        matchQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = end;
      }
    } else if (year) {
      const startYear = new Date(`${year}-01-01T00:00:00.000Z`);
      const endYear = new Date(`${parseInt(year) + 1}-01-01T00:00:00.000Z`);
      matchQuery.createdAt = { $gte: startYear, $lt: endYear };
    }

    if (customerId) {
      matchQuery.customer = new mongoose.Types.ObjectId(customerId);
    }

    const monthlySales = await BILLING.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "+05:30" }
          },
          totalAmount: { $sum: "$totalAmount" },
          totalSubtotal: { $sum: "$subtotal" },
          billCount: { $sum: 1 },
          totalQty: { $sum: { $sum: "$items.qty" } }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    const headers = ["Month", "Invoices Count", "Pieces Sold", "Revenue (INR)", "Avg Invoice Value (INR)"];
    const csvRows = monthlySales.map((m) => {
      const avg = Math.round(m.totalAmount / (m.billCount || 1));
      return [
        escapeCSV(m._id),
        m.billCount,
        m.totalQty,
        m.totalAmount,
        avg
      ].join(",");
    });
    const csvContent = [headers.join(","), ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="monthly-sales-report-${new Date().toISOString().split("T")[0]}.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /report/product-sales/export
exports.exportProductSalesReport = async (req, res) => {
  try {
    const { search, category, startDate, endDate, month, customerId } = req.query;
    
    let matchQuery = { isDeleted: { $ne: true } };
    
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        matchQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = end;
      }
    } else if (month) {
      const [y, m] = month.split("-").map(Number);
      const startMonth = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      const endMonth = new Date(Date.UTC(y, m, 1, 0, 0, 0));
      matchQuery.createdAt = { $gte: startMonth, $lt: endMonth };
    }

    if (customerId) {
      matchQuery.customer = new mongoose.Types.ObjectId(customerId);
    }

    const pipeline = [
      { $match: matchQuery },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          productName: { $first: "$items.productName" },
          totalQty: { $sum: "$items.qty" },
          totalRevenue: { $sum: "$items.total" },
          avgPrice: { $avg: "$items.price" }
        }
      }
    ];

    pipeline.push({
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productDetails"
      }
    });

    pipeline.push({
      $unwind: {
        path: "$productDetails",
        preserveNullAndEmptyArrays: true
      }
    });

    if (category) {
      pipeline.push({
        $match: {
          "productDetails.category": new mongoose.Types.ObjectId(category)
        }
      });
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pipeline.push({
        $match: {
          $or: [
            { productName: { $regex: escapedSearch, $options: "i" } },
            { "productDetails.designNo": { $regex: escapedSearch, $options: "i" } },
            { "productDetails.sku": { $regex: escapedSearch, $options: "i" } },
            { "productDetails.productCode": { $regex: escapedSearch, $options: "i" } }
          ]
        }
      });
    }

    pipeline.push({
      $lookup: {
        from: "categorymasters",
        localField: "productDetails.category",
        foreignField: "_id",
        as: "categoryDetails"
      }
    });

    pipeline.push({
      $unwind: {
        path: "$categoryDetails",
        preserveNullAndEmptyArrays: true
      }
    });

    pipeline.push({
      $project: {
        _id: 1,
        productName: 1,
        designNo: { $ifNull: ["$productDetails.designNo", "N/A"] },
        sku: { $ifNull: ["$productDetails.sku", "N/A"] },
        productCode: { $ifNull: ["$productDetails.productCode", "N/A"] },
        category: { $ifNull: ["$categoryDetails.name", "N/A"] },
        totalQty: 1,
        totalRevenue: 1,
        avgPrice: 1
      }
    });

    pipeline.push({ $sort: { totalQty: -1 } });

    const productSales = await BILLING.aggregate(pipeline);

    const headers = ["Design No", "Product Code", "SKU", "Category", "Pieces Sold", "Avg Price (INR)", "Revenue (INR)"];
    const csvRows = productSales.map((p) =>
      [
        escapeCSV(p.designNo),
        escapeCSV(p.productCode),
        escapeCSV(p.sku),
        escapeCSV(p.category),
        p.totalQty,
        Math.round(p.avgPrice),
        p.totalRevenue
      ].join(",")
    );
    const csvContent = [headers.join(","), ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="product-dispatch-report-${new Date().toISOString().split("T")[0]}.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
