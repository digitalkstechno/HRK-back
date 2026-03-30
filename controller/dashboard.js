const Billing = require("../model/billing");
const Product = require("../model/product");
const Customer = require("../model/customer");
const InventoryItem = require("../model/inventoryItem");
const CategoryMaster = require("../model/categorymaster");
const mongoose = require("mongoose");

exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Optimized parallel execution. Each query is targeted and utilizes indexes properly.
    const [
      todaySalesData,
      totalProducts,
      totalCustomers,
      recentSalesFromDb,
      categoryStats,
      inStockCount,
      soldCount,
      stockCountsPerProduct,
      allActiveProducts
    ] = await Promise.all([
      // 1. Today's Sales
      Billing.aggregate([
        { $match: { createdAt: { $gte: today }, isDeleted: false } }, // High-speed index match
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
      ]),

      // 2. Count metrics
      Product.countDocuments({ isDeleted: false }),
      Customer.countDocuments({ isDeleted: false }),

      // 3. Recent Sales (Lightweight fetch)
      Billing.find({ isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("customer", "name")
        .select("billNumber totalAmount createdAt customer")
        .lean(),

      // 4. Products by Category (Single aggregate)
      Product.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: "$category", value: { $sum: 1 } } },
        { $lookup: { from: "categorymasters", localField: "_id", foreignField: "_id", as: "cat" } },
        { $unwind: "$cat" },
        { $project: { _id: 0, name: "$cat.name", value: 1 } }
      ]),

      // 5. Global Inventory Stats (Direct counts are faster than facets)
      InventoryItem.countDocuments({ isDeleted: false, status: "In Stock" }),
      InventoryItem.countDocuments({ isDeleted: false, status: "Sold" }),

      // 6. Stock mapping for low stock alert
      InventoryItem.aggregate([
        { $match: { isDeleted: false, status: { $in: ["In Stock", "Partial"] } } },
        { $group: { _id: "$product", count: { $sum: 1 } } }
      ]),

      // 7. Core product info
      Product.find({ isDeleted: false }).select("productCode designNo sku").lean()
    ]);

    // Format Today's Sales
    const todaySales = todaySalesData[0] || { total: 0, count: 0 };

    // Process Stock Alert in a high-speed Map operation
    const stockMap = new Map();
    stockCountsPerProduct.forEach(item => stockMap.set(item._id.toString(), item.count));

    const lowStockDetails = [];
    let lowStockCount = 0;
    
    // One-pass processing through all active products
    for (const prod of allActiveProducts) {
        const stock = stockMap.get(prod._id.toString()) || 0;
        if (stock < 10) {
            lowStockCount++;
            if (lowStockDetails.length < 10) {
                lowStockDetails.push({
                    product: `${prod.productCode} - ${prod.designNo}`,
                    sku: prod.sku,
                    stock: stock,
                    reorderLevel: 10
                });
            }
        }
    }

    res.status(200).json({
      status: true,
      data: {
        stats: [
          { title: "Today's Sales", value: `₹${(todaySales.total || 0).toLocaleString()}`, change: `${todaySales.count || 0} bills`, trend: "up", icon: "DollarSign", color: "text-green-600", bgColor: "bg-green-100" },
          { title: "Total Products", value: totalProducts.toLocaleString(), change: "Active items", trend: "up", icon: "Package", color: "text-blue-600", bgColor: "bg-blue-100" },
          { title: "Low Stock Alert", value: lowStockCount.toString(), change: "Needs attention", trend: "down", icon: "AlertTriangle", color: "text-orange-600", bgColor: "bg-orange-100", alert: lowStockCount > 0 },
          { title: "Total Customers", value: totalCustomers.toLocaleString(), change: "Retail & Wholesale", trend: "up", icon: "Users", color: "text-purple-600", bgColor: "bg-purple-100" },
        ],
        lowStockItems: lowStockDetails,
        recentSales: recentSalesFromDb.map(s => ({
            id: s.billNumber || s._id.toString().slice(-6).toUpperCase(),
            customer: s.customer?.name || "Walking Customer",
            amount: `₹${s.totalAmount.toLocaleString()}`,
            time: formatTimeAgo(s.createdAt)
        })),
        categoryData: categoryStats,
        inventoryStatus: [
            { name: "In Stock", value: inStockCount },
            { name: "Sold", value: soldCount }
        ]
      }
    });

  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

function formatTimeAgo(date) {
    const diff = (new Date() - new Date(date)) / 1000;
    if (diff < 60) return `${Math.floor(diff)} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
}
