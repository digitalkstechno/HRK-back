let CUSTOMER = require("../model/customer");

exports.createCustomer = async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const customer = await CUSTOMER.create({ name, phone, email });
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllCustomers = async (req, res) => {
  try {
    const customers = await CUSTOMER.find();
    res.status(200).json({ success: true, data: customers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchCustomerById = async (req, res) => {
  try {
    const customer = await CUSTOMER.findById(req.params.id);
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
    const { name, phone, email } = req.body;
    const customer = await CUSTOMER.findByIdAndUpdate(
      req.params.id,
      { name, phone, email },
      { new: true }
    );
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
    const customer = await CUSTOMER.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    res.status(200).json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
