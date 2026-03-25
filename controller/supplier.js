const SUPPLIER = require("../model/supplier");

exports.createSupplier = async (req, res) => {
  try {
    const { name, number, gstNumber, station, state } = req.body;
    const supplier = await SUPPLIER.create({ name, number, gstNumber, station, state });
    res.status(201).json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllSuppliers = async (req, res) => {
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

    const [totalRecords, data] = await Promise.all([
      SUPPLIER.countDocuments(query),
      SUPPLIER.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

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

exports.fetchSupplierDropdown = async (req, res) => {
  try {
    const search = req.query.search || "";
    const query = {
      isDeleted: { $ne: true },
      $or: [
        { name: { $regex: search, $options: "i" } },
        { number: { $regex: search, $options: "i" } },
      ],
    };
    const data = await SUPPLIER.find(query).select("name number").sort({ name: 1 }).lean();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchSupplierById = async (req, res) => {
  try {
    const supplier = await SUPPLIER.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    res.status(200).json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const { name, number, gstNumber, station, state } = req.body;
    const supplier = await SUPPLIER.findByIdAndUpdate(
      req.params.id,
      { name, number, gstNumber, station, state },
      { new: true }
    ).lean();
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    res.status(200).json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSupplier = async (req, res) => {
  try {
    const supplier = await SUPPLIER.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    res.status(200).json({ success: true, message: "Supplier deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
