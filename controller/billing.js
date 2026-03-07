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
    const billings = await BILLING.find().populate("customer");
    res.status(200).json({ success: true, data: billings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchBillingById = async (req, res) => {
  try {
    const billing = await BILLING.findById(req.params.id).populate("customer");
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
    const billing = await BILLING.findByIdAndDelete(req.params.id);
    if (!billing) {
      return res.status(404).json({ success: false, message: "Billing not found" });
    }
    res.status(200).json({ success: true, message: "Billing deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
