const STAFF = require("../model/staff");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

exports.createStaff = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");

    const staffData = {
      fullName,
      email,
      status: "active",
      password: hashedPassword,
    };

    const staffDetails = await STAFF.create(staffData);

    return res.status(201).json({
      status: "Success",
      message: "Staff created successfully",
      data: staffDetails,
    });
  } catch (error) {
    return res.status(400).json({
      status: "Fail",
      message: error.message,
    });
  }
};

exports.loginStaff = async (req, res) => {
  try {
    const { email, password } = req.body;
    let staffverify = await STAFF.findOne({ email });
    if (!staffverify) {
      throw new Error("Invalid Email or password");
    }
    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");

    if (hashedPassword !== staffverify.password) {
      throw new Error("Invalid password");
    }
    let token = jwt.sign({ id: staffverify._id }, process.env.JWT_SECRET_KEY);
    return res.status(200).json({
      status: "Success",
      message: "Staff logged in successfully",
      data: staffverify,
      token,
    });
  } catch (error) {
    return res.status(400).json({
      status: "Fail",
      message: error.message,
    });
  }
};

exports.fetchAllStaffs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";

    const query = {
      $or: [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
      ],
    };

    const totalStaff = await STAFF.countDocuments(query);
    const staffsData = await STAFF.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: "Success",
      message: "Staffs fetched successfully",
      pagination: {
        totalRecords: totalStaff,
        currentPage: page,
        totalPages: Math.ceil(totalStaff / limit),
        limit,
      },
      data: staffsData,
    });
  } catch (error) {
    return res.status(500).json({
      status: "Fail",
      message: error.message,
    });
  }
};

exports.fetchStaffById = async (req, res) => {
  try {
    let staffId = req.params.id;
    let staffData = await STAFF.findById(staffId);
    if (!staffData) {
      throw new Error("Staff not found");
    }
    return res.status(200).json({
      status: "Success",
      message: "Staff fetched successfully",
      data: staffData,
    });
  } catch (error) {
    return res.status(404).json({
      status: "Fail",
      message: error.message,
    });
  }
};

exports.getCurrentStaff = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: "Fail",
        message: "Unauthorized",
      });
    }

    return res.status(200).json({
      status: "Success",
      data: req.user,
    });
  } catch (error) {
    return res.status(500).json({
      status: "Fail",
      message: error.message,
    });
  }
};

exports.staffUpdate = async (req, res) => {
  try {
    let staffId = req.params.id;
    let oldStaff = await STAFF.findById(staffId);

    if (!oldStaff) {
      throw new Error("Staff not found");
    }
    if (req.body.password) {
      req.body.password = crypto.createHash("sha256").update(req.body.password).digest("hex");
    }

    let updatedStaff = await STAFF.findByIdAndUpdate(staffId, req.body, {
      new: true,
    });
    return res.status(200).json({
      status: "Success",
      message: "Staff updated successfully",
      data: updatedStaff,
    });
  } catch (error) {
    return res.status(404).json({
      status: "Fail",
      message: error.message,
    });
  }
};

exports.staffDelete = async (req, res) => {
  try {
    let staffId = req.params.id;
    let oldStaff = await STAFF.findById(staffId);

    if (!oldStaff) {
      throw new Error("Staff not found");
    }
    await STAFF.findByIdAndDelete(staffId);

    return res.status(200).json({
      status: "Success",
      message: "Staff deleted successfully",
    });
  } catch (error) {
    return res.status(404).json({
      status: "Fail",
      message: error.message,
    });
  }
};
