let BILLING = require("../model/billing");

exports.createBilling = async (req, res) => {
  try {
    const { customer, scanBarcode, items } = req.body;
    const billing = await BILLING.create({ customer, scanBarcode, items });
    res.status(201).json({ success: true, data: billing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllBillings = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      isDeleted: false,
      $or: [
        { scanBarcode: { $regex: search, $options: "i" } },
      ],
    };

    const totalRecords = await BILLING.countDocuments(query);
    const data = await BILLING.find(query)
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


exports.fetchBillingById = async (req, res) => {
  try {
    const billing = await BILLING.findOne({ _id: req.params.id, isDeleted: false }).populate("customer");
    if (!billing) {
      return res.status(404).json({ success: false, message: "Billing not found" });
    }
    res.status(200).json({ success: true, data: billing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateBilling = async (req, res) => {
  try {
    const { customer, scanBarcode, items } = req.body;
    const billing = await BILLING.findByIdAndUpdate(
      req.params.id,
      { customer, scanBarcode, items },
      { new: true }
    ).populate("customer");
    if (!billing) {
      return res.status(404).json({ success: false, message: "Billing not found" });
    }
    res.status(200).json({ success: true, data: billing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBilling = async (req, res) => {
  try {
    const billing = await BILLING.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!billing) {
      return res.status(404).json({ success: false, message: "Billing not found" });
    }
    res.status(200).json({ success: true, message: "Billing deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
