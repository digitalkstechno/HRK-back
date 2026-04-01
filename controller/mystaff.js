let MYSTAFF = require("../model/mystaff");

exports.createMyStaff = async (req, res) => {
  try {
    const { name } = req.body;
    const myStaff = await MYSTAFF.create({ name });
    res.status(201).json({ success: true, data: myStaff });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllMyStaffs = async (req, res) => {
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
      MYSTAFF.countDocuments(query),
      MYSTAFF.find(query)
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

exports.fetchMyStaffById = async (req, res) => {
  try {
    const myStaff = await MYSTAFF.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
    if (!myStaff) {
      return res.status(404).json({ success: false, message: "Staff member not found" });
    }
    res.status(200).json({ success: true, data: myStaff });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMyStaff = async (req, res) => {
  try {
    const { name } = req.body;
    const myStaff = await MYSTAFF.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    ).lean();
    if (!myStaff) {
      return res.status(404).json({ success: false, message: "Staff member not found" });
    }
    res.status(200).json({ success: true, data: myStaff });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMyStaff = async (req, res) => {
  try {
    const myStaff = await MYSTAFF.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!myStaff) {
      return res.status(404).json({ success: false, message: "Staff member not found" });
    }
    res.status(200).json({ success: true, message: "Staff member deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyStaffDropdown = async (req, res) => {
  try {
    const search = req.query.search || "";
    const query = {
      isDeleted: { $ne: true },
      name: { $regex: search, $options: "i" },
    };
    const data = await MYSTAFF.find(query, "name").sort({ name: 1 }).lean();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
