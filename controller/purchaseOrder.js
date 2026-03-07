let PURCHASEORDER = require("../model/purchaseOrder");

exports.createPurchaseOrder = async (req, res) => {
  try {
    const { orderId, supplier, items, amount, date, status } = req.body;
    const purchaseOrder = await PURCHASEORDER.create({ orderId, supplier, items, amount, date, status });
    res.status(201).json({ success: true, data: purchaseOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllPurchaseOrders = async (req, res) => {
  try {
    const purchaseOrders = await PURCHASEORDER.find();
    res.status(200).json({ success: true, data: purchaseOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchPurchaseOrderById = async (req, res) => {
  try {
    const purchaseOrder = await PURCHASEORDER.findById(req.params.id);
    if (!purchaseOrder) {
      return res.status(404).json({ success: false, message: "PurchaseOrder not found" });
    }
    res.status(200).json({ success: true, data: purchaseOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePurchaseOrder = async (req, res) => {
  try {
    const { orderId, supplier, items, amount, date, status } = req.body;
    const purchaseOrder = await PURCHASEORDER.findByIdAndUpdate(
      req.params.id,
      { orderId, supplier, items, amount, date, status },
      { new: true }
    );
    if (!purchaseOrder) {
      return res.status(404).json({ success: false, message: "PurchaseOrder not found" });
    }
    res.status(200).json({ success: true, data: purchaseOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePurchaseOrder = async (req, res) => {
  try {
    const purchaseOrder = await PURCHASEORDER.findByIdAndDelete(req.params.id);
    if (!purchaseOrder) {
      return res.status(404).json({ success: false, message: "PurchaseOrder not found" });
    }
    res.status(200).json({ success: true, message: "PurchaseOrder deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
