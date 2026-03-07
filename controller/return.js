let RETURN = require("../model/return");

exports.createReturn = async (req, res) => {
  try {
    const { returnId, scanBarcode, invoice, product, customer, amount, date, refundMode, status } = req.body;
    const returnData = await RETURN.create({ returnId, scanBarcode, invoice, product, customer, amount, date, refundMode, status });
    res.status(201).json({ success: true, data: returnData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllReturns = async (req, res) => {
  try {
    const returns = await RETURN.find().populate("product customer");
    res.status(200).json({ success: true, data: returns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchReturnById = async (req, res) => {
  try {
    const returnData = await RETURN.findById(req.params.id).populate("product customer");
    if (!returnData) {
      return res.status(404).json({ success: false, message: "Return not found" });
    }
    res.status(200).json({ success: true, data: returnData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateReturn = async (req, res) => {
  try {
    const { returnId, scanBarcode, invoice, product, customer, amount, date, refundMode, status } = req.body;
    const returnData = await RETURN.findByIdAndUpdate(
      req.params.id,
      { returnId, scanBarcode, invoice, product, customer, amount, date, refundMode, status },
      { new: true }
    ).populate("product customer");
    if (!returnData) {
      return res.status(404).json({ success: false, message: "Return not found" });
    }
    res.status(200).json({ success: true, data: returnData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteReturn = async (req, res) => {
  try {
    const returnData = await RETURN.findByIdAndDelete(req.params.id);
    if (!returnData) {
      return res.status(404).json({ success: false, message: "Return not found" });
    }
    res.status(200).json({ success: true, message: "Return deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
