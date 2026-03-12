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
      isDeleted: false,
      name: { $regex: search, $options: "i" },
    };

    const totalRecords = await CATEGORYMASTER.countDocuments(query);
    const data = await CATEGORYMASTER.find(query)
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


exports.fetchCategoryMasterById = async (req, res) => {
  try {
    const categoryMaster = await CATEGORYMASTER.findOne({ _id: req.params.id, isDeleted: false });
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
    );
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
    const data = await CATEGORYMASTER.find({ isDeleted: false }, "name");
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
