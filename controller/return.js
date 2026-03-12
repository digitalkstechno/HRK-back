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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      isDeleted: false,
      $or: [
        { returnId: { $regex: search, $options: "i" } },
        { scanBarcode: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
      ],
    };

    const totalRecords = await RETURN.countDocuments(query);
    const data = await RETURN.find(query)
      .populate("product customer")
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


exports.fetchReturnById = async (req, res) => {
  try {
    const returnData = await RETURN.findOne({ _id: req.params.id, isDeleted: false }).populate("product customer");
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
    const returnData = await RETURN.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!returnData) {
      return res.status(404).json({ success: false, message: "Return not found" });
    }
    res.status(200).json({ success: true, message: "Return deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
