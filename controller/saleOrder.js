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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      isDeleted: { $ne: true },
      $or: [
        { orderId: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
      ],
    };

    const totalRecords = await SALEORDER.countDocuments(query);
    const data = await SALEORDER.find(query)
      .populate("customer")
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


exports.fetchSaleOrderById = async (req, res) => {
  try {
    const saleOrder = await SALEORDER.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).populate("customer");
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
    const saleOrder = await SALEORDER.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!saleOrder) {
      return res.status(404).json({ success: false, message: "SaleOrder not found" });
    }
    res.status(200).json({ success: true, message: "SaleOrder deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
