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
    const sizeMasters = await SIZEMASTER.find();
    res.status(200).json({ success: true, data: sizeMasters });
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
