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

    // 1. Today's Sales
    const todaySales = await Billing.aggregate([
      { $match: { createdAt: { $gte: today }, isDeleted: false } },
      { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
    ]);

    // 2. Total Products
    const totalProducts = await Product.countDocuments({ isDeleted: false });

    // 3. Total Customers
    const totalCustomers = await Customer.countDocuments({ isDeleted: false });

    // 4. Low Stock Alert (Products with fewer than 10 items in stock)
    const allProducts = await Product.find({ isDeleted: false }).select("productCode designNo sku");
    const lowStockDetails = [];
    let lowStockCount = 0;

    for (const prod of allProducts) {
        const stockCount = await InventoryItem.countDocuments({ 
            product: prod._id, 
            status: "In Stock", 
            isDeleted: false 
        });

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

    // 5. Recent Sales
    const recentSalesFromDb = await Billing.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("customer", "name");

    // 6. Products by Category (Always visible if categories exist)
    const allCategories = await CategoryMaster.find({ isDeleted: false }).select("name");
    const categoryData = await Promise.all(allCategories.map(async (cat) => {
        const prodCount = await Product.countDocuments({ 
            category: cat._id, 
            isDeleted: false 
        });

        return {
            name: cat.name,
            value: prodCount
        };
    }));

    // 7. Inventory Status (Global)
    const inStockGlobal = await InventoryItem.countDocuments({ status: "In Stock", isDeleted: false });
    const soldGlobal = await InventoryItem.countDocuments({ status: "Sold", isDeleted: false });

    res.status(200).json({
      status: true,
      data: {
        stats: [
          { title: "Today's Sales", value: `₹${(todaySales[0]?.total || 0).toLocaleString()}`, change: `${todaySales[0]?.count || 0} bills`, trend: "up", icon: "DollarSign", color: "text-green-600", bgColor: "bg-green-100" },
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
        categoryData: categoryData,
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
