let STOCK = require("../model/stock");

exports.createStock = async (req, res) => {
  try {
    const { entryDate, supplier, invoiceNumber, items, totalAmount, status } = req.body;
    const stock = await STOCK.create({ entryDate, supplier, invoiceNumber, items, totalAmount, status });
    res.status(201).json({ success: true, data: stock });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllStocks = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      $or: [
        { supplier: { $regex: search, $options: "i" } },
        { invoiceNumber: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
      ],
    };

    const totalRecords = await STOCK.countDocuments(query);
    const data = await STOCK.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

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


exports.fetchStockById = async (req, res) => {
  try {
    const stock = await STOCK.findById(req.params.id);
    if (!stock) {
      return res.status(404).json({ success: false, message: "Stock not found" });
    }
    res.status(200).json({ success: true, data: stock });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateStock = async (req, res) => {
  try {
    const { entryDate, supplier, invoiceNumber, items, totalAmount, status } = req.body;
    const stock = await STOCK.findByIdAndUpdate(
      req.params.id,
      { entryDate, supplier, invoiceNumber, items, totalAmount, status },
      { new: true }
    );
    if (!stock) {
      return res.status(404).json({ success: false, message: "Stock not found" });
    }
    res.status(200).json({ success: true, data: stock });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteStock = async (req, res) => {
  try {
    const stock = await STOCK.findByIdAndDelete(req.params.id);
    if (!stock) {
      return res.status(404).json({ success: false, message: "Stock not found" });
    }
    res.status(200).json({ success: true, message: "Stock deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
