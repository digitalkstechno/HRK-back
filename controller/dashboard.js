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

    // Parallel execution of all major stats to drastically reduce response time
    const [
      todaySalesData,
      totalProducts,
      totalCustomers,
      recentSalesFromDb,
      categoryStats,
      inventoryGlobalStats,
      allProducts
    ] = await Promise.all([
      // 1. Today's Sales
      Billing.aggregate([
        { $match: { createdAt: { $gte: today }, isDeleted: false } },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
      ]),

      // 2. Total Products
      Product.countDocuments({ isDeleted: false }),

      // 3. Total Customers
      Customer.countDocuments({ isDeleted: false }),

      // 4. Recent Sales
      Billing.find({ isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("customer", "name")
        .lean(),

      // 5. Products by Category (Single Aggregation instead of loop)
      Product.aggregate([
        { $match: { isDeleted: false, category: { $ne: null } } },
        { $group: { _id: "$category", value: { $sum: 1 } } },
        { $lookup: { from: "categorymasters", localField: "_id", foreignField: "_id", as: "cat" } },
        { $unwind: "$cat" },
        { $project: { _id: 0, name: "$cat.name", value: 1 } }
      ]),

      // 6 & 7. Combined Inventory & Low Stock Facet
      InventoryItem.aggregate([
          { $match: { isDeleted: false } }, // Main match
          {
            $facet: {
              inventoryGlobal: [
                { $match: { status: { $in: ["In Stock", "Sold"] } } },
                { $group: { _id: "$status", count: { $sum: 1 } } }
              ],
              inStockByProduct: [
                { $match: { status: "In Stock" } },
                { $group: { _id: "$product", count: { $sum: 1 } } }
              ]
            }
          }
      ]),

      // 8. Fetch basic product info to identify 0-stock products
      Product.find({ isDeleted: false }).select("productCode designNo sku").lean()
    ]);

    // Format Today's Sales
    const todaySales = todaySalesData[0] || { total: 0, count: 0 };

    // Process Inventory Stats from Combined Facet result
    const facetResult = inventoryGlobalStats[0] || { inventoryGlobal: [], inStockByProduct: [] };
    const globalStatusData = facetResult.inventoryGlobal;
    const inStockCounts = facetResult.inStockByProduct;

    const inStockGlobal = globalStatusData.find(i => i._id === "In Stock")?.count || 0;
    const soldGlobal = globalStatusData.find(i => i._id === "Sold")?.count || 0;

    // Process Low Stock in Memory (Extremely fast for thousands of records)
    const stockMap = new Map();
    inStockCounts.forEach(item => stockMap.set(item._id.toString(), item.count));

    const lowStockDetails = [];
    let lowStockCount = 0;
    for (const prod of allProducts) {
        const stockCount = stockMap.get(prod._id.toString()) || 0;
        if (stockCount < 10) {
            lowStockCount++;
            if (lowStockDetails.length < 10) {
                lowStockDetails.push({
                    product: `${prod.productCode} - ${prod.designNo}`,
                    sku: prod.sku,
                    stock: stockCount,
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
            { name: "In Stock", value: inStockGlobal },
            { name: "Sold", value: soldGlobal }
        ]
      }
    });

  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return Math.floor(seconds) + " seconds ago";
}
