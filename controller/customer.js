let CUSTOMER = require("../model/customer");

exports.createCustomer = async (req, res) => {
  try {
    const { name, number, gstNumber, station, state, transport } = req.body;
    const customer = await CUSTOMER.create({ name, number, gstNumber, station, state, transport });
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      isDeleted: { $ne: true },
      $or: [
        { name: { $regex: search, $options: "i" } },
        { number: { $regex: search, $options: "i" } },
        { gstNumber: { $regex: search, $options: "i" } },
        { station: { $regex: search, $options: "i" } },
        { state: { $regex: search, $options: "i" } },
      ],
    };

    const totalRecords = await CUSTOMER.countDocuments(query);
    const data = await CUSTOMER.find(query)
      .populate("transport")
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


exports.fetchCustomerById = async (req, res) => {
  try {
    const customer = await CUSTOMER.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).populate("transport");
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { name, number, gstNumber, station, state, transport } = req.body;
    const customer = await CUSTOMER.findByIdAndUpdate(
      req.params.id,
      { name, number, gstNumber, station, state, transport },
      { new: true }
    ).populate("transport");
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await CUSTOMER.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    res.status(200).json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
