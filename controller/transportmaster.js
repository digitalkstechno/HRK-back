let TRANSPORTMASTER = require("../model/transportmaster");

exports.createTransportMaster = async (req, res) => {
  try {
    const { name } = req.body;
    const transportMaster = await TRANSPORTMASTER.create({ name });
    res.status(201).json({ success: true, data: transportMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllTransportMasters = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      isDeleted: { $ne: true },
      name: { $regex: search, $options: "i" },
    };

    const [totalRecords, data] = await Promise.all([
      TRANSPORTMASTER.countDocuments(query),
      TRANSPORTMASTER.find(query)
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

exports.fetchTransportMasterById = async (req, res) => {
  try {
    const transportMaster = await TRANSPORTMASTER.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
    if (!transportMaster) {
      return res.status(404).json({ success: false, message: "TransportMaster not found" });
    }
    res.status(200).json({ success: true, data: transportMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTransportMaster = async (req, res) => {
  try {
    const { name } = req.body;
    const transportMaster = await TRANSPORTMASTER.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    ).lean();
    if (!transportMaster) {
      return res.status(404).json({ success: false, message: "TransportMaster not found" });
    }
    res.status(200).json({ success: true, data: transportMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTransportMaster = async (req, res) => {
  try {
    const transportMaster = await TRANSPORTMASTER.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!transportMaster) {
      return res.status(404).json({ success: false, message: "TransportMaster not found" });
    }
    res.status(200).json({ success: true, message: "TransportMaster deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTransportDropdown = async (req, res) => {
  try {
    const search = req.query.search || "";
    const query = {
      isDeleted: { $ne: true },
      name: { $regex: search, $options: "i" },
    };
    const data = await TRANSPORTMASTER.find(query, "name").sort({ name: 1 }).lean();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
