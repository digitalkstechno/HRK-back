let SIZEMASTER = require("../model/sizemaster");

const assignMissingOrders = async () => {
  const missingDocs = await SIZEMASTER.find({ isDeleted: { $ne: true }, order: { $exists: false } }).sort({ createdAt: 1 }).lean();
  if (!missingDocs.length) return;

  const maxOrdered = await SIZEMASTER.findOne({ isDeleted: { $ne: true }, order: { $exists: true } })
    .sort({ order: -1 })
    .select("order")
    .lean();

  let nextOrder = maxOrdered && typeof maxOrdered.order === "number" ? maxOrdered.order + 1 : 1;
  const operations = missingDocs.map((doc) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: nextOrder++ } },
    },
  }));

  if (operations.length) {
    await SIZEMASTER.bulkWrite(operations);
  }
};

const getNextOrder = async () => {
  const maxOrdered = await SIZEMASTER.findOne({ isDeleted: { $ne: true }, order: { $exists: true } })
    .sort({ order: -1 })
    .select("order")
    .lean();
  return maxOrdered && typeof maxOrdered.order === "number" ? maxOrdered.order + 1 : 1;
};

exports.createSizeMaster = async (req, res) => {
  try {
    const { name, description } = req.body;
    const order = await getNextOrder();
    const sizeMaster = await SIZEMASTER.create({ name, description, order });
    res.status(201).json({ success: true, data: sizeMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllSizeMasters = async (req, res) => {
  try {
    await assignMissingOrders();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      isDeleted: { $ne: true },
      $or: [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ],
    };

    const [totalRecords, data] = await Promise.all([
      SIZEMASTER.countDocuments(query),
      SIZEMASTER.find(query)
        .sort({ order: 1, createdAt: -1 })
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

exports.fetchSizeMasterList = async (req, res) => {
  try {
    await assignMissingOrders();

    const data = await SIZEMASTER.find({ isDeleted: { $ne: true } })
      .sort({ order: 1, createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchSizeMasterById = async (req, res) => {
  try {
    const sizeMaster = await SIZEMASTER.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
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
    const { name, description, order } = req.body;
    const updateData = { name, description };
    if (typeof order === "number") {
      updateData.order = order;
    }
    const sizeMaster = await SIZEMASTER.findByIdAndUpdate(req.params.id, updateData, { new: true }).lean();
    if (!sizeMaster) {
      return res.status(404).json({ success: false, message: "SizeMaster not found" });
    }
    res.status(200).json({ success: true, data: sizeMaster });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reorderSizeMasters = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, message: "`ids` must be an array" });
    }

    const operations = ids.map((id, index) => ({
      updateOne: {
        filter: { _id: id, isDeleted: { $ne: true } },
        update: { $set: { order: index + 1 } },
      },
    }));

    if (operations.length) {
      await SIZEMASTER.bulkWrite(operations);
    }

    res.status(200).json({ success: true, message: "Order updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSizeMaster = async (req, res) => {
  try {
    const sizeMaster = await SIZEMASTER.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
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
    const search = req.query.search || "";
    const query = {
      isDeleted: { $ne: true },
      name: { $regex: search, $options: "i" },
    };
    const data = await SIZEMASTER.find(query, "name").sort({ order: 1, name: 1 }).lean();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
