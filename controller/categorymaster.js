let CATEGORYMASTER = require("../model/categorymaster");

exports.createCategoryMaster = async (req, res) => {
  try {
    const { name } = req.body;
    const categoryMaster = await CATEGORYMASTER.create({ name });
    res.status(201).json({ success: true, data: categoryMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllCategoryMasters = async (req, res) => {
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
      CATEGORYMASTER.countDocuments(query),
      CATEGORYMASTER.find(query)
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

exports.fetchCategoryMasterById = async (req, res) => {
  try {
    const categoryMaster = await CATEGORYMASTER.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
    if (!categoryMaster) {
      return res.status(404).json({ success: false, message: "CategoryMaster not found" });
    }
    res.status(200).json({ success: true, data: categoryMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCategoryMaster = async (req, res) => {
  try {
    const { name } = req.body;
    const categoryMaster = await CATEGORYMASTER.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    ).lean();
    if (!categoryMaster) {
      return res.status(404).json({ success: false, message: "CategoryMaster not found" });
    }
    res.status(200).json({ success: true, data: categoryMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCategoryMaster = async (req, res) => {
  try {
    const categoryMaster = await CATEGORYMASTER.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!categoryMaster) {
      return res.status(404).json({ success: false, message: "CategoryMaster not found" });
    }
    res.status(200).json({ success: true, message: "CategoryMaster deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCategoryDropdown = async (req, res) => {
  try {
    const search = req.query.search || "";
    const query = {
      isDeleted: { $ne: true },
      name: { $regex: search, $options: "i" },
    };
    const data = await CATEGORYMASTER.find(query, "name").sort({ name: 1 }).lean();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
