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
    const stocks = await STOCK.find();
    res.status(200).json({ success: true, data: stocks });
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
