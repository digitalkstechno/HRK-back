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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      isDeleted: { $ne: true },
      $or: [
        { orderId: { $regex: search, $options: "i" } },
        { supplier: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
      ],
    };

    const totalRecords = await PURCHASEORDER.countDocuments(query);
    const data = await PURCHASEORDER.find(query)
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


exports.fetchPurchaseOrderById = async (req, res) => {
  try {
    const purchaseOrder = await PURCHASEORDER.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
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
    const purchaseOrder = await PURCHASEORDER.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!purchaseOrder) {
      return res.status(404).json({ success: false, message: "PurchaseOrder not found" });
    }
    res.status(200).json({ success: true, message: "PurchaseOrder deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
