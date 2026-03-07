let SALEORDER = require("../model/saleOrder");

exports.createSaleOrder = async (req, res) => {
  try {
    const { orderId, customer, items, amount, date, status } = req.body;
    const saleOrder = await SALEORDER.create({ orderId, customer, items, amount, date, status });
    res.status(201).json({ success: true, data: saleOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllSaleOrders = async (req, res) => {
  try {
    const saleOrders = await SALEORDER.find().populate("customer");
    res.status(200).json({ success: true, data: saleOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchSaleOrderById = async (req, res) => {
  try {
    const saleOrder = await SALEORDER.findById(req.params.id).populate("customer");
    if (!saleOrder) {
      return res.status(404).json({ success: false, message: "SaleOrder not found" });
    }
    res.status(200).json({ success: true, data: saleOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSaleOrder = async (req, res) => {
  try {
    const { orderId, customer, items, amount, date, status } = req.body;
    const saleOrder = await SALEORDER.findByIdAndUpdate(
      req.params.id,
      { orderId, customer, items, amount, date, status },
      { new: true }
    ).populate("customer");
    if (!saleOrder) {
      return res.status(404).json({ success: false, message: "SaleOrder not found" });
    }
    res.status(200).json({ success: true, data: saleOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSaleOrder = async (req, res) => {
  try {
    const saleOrder = await SALEORDER.findByIdAndDelete(req.params.id);
    if (!saleOrder) {
      return res.status(404).json({ success: false, message: "SaleOrder not found" });
    }
    res.status(200).json({ success: true, message: "SaleOrder deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
