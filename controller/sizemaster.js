let SIZEMASTER = require("../model/sizemaster");

exports.createSizeMaster = async (req, res) => {
  try {
    const { name, description } = req.body;
    const sizeMaster = await SIZEMASTER.create({ name, description });
    res.status(201).json({ success: true, data: sizeMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllSizeMasters = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      $or: [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ],
    };

    const totalRecords = await SIZEMASTER.countDocuments(query);
    const data = await SIZEMASTER.find(query)
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


exports.fetchSizeMasterById = async (req, res) => {
  try {
    const sizeMaster = await SIZEMASTER.findById(req.params.id);
    if (!sizeMaster) {
      return res.status(404).json({ success: false, message: "SizeMaster not found" });
    }
    res.status(200).json({ success: true, data: sizeMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSizeMaster = async (req, res) => {
  try {
    const { name, description } = req.body;
    const sizeMaster = await SIZEMASTER.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true }
    );
    if (!sizeMaster) {
      return res.status(404).json({ success: false, message: "SizeMaster not found" });
    }
    res.status(200).json({ success: true, data: sizeMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSizeMaster = async (req, res) => {
  try {
    const sizeMaster = await SIZEMASTER.findByIdAndDelete(req.params.id);
    if (!sizeMaster) {
      return res.status(404).json({ success: false, message: "SizeMaster not found" });
    }
    res.status(200).json({ success: true, message: "SizeMaster deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSizeDropdown = async (req, res) => {
  try {
    const data = await SIZEMASTER.find({}, "name");
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
