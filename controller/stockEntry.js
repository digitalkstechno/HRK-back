const STOCKENTRY = require("../model/stockEntry");
const INVENTORYITEM = require("../model/inventoryItem");
const PRODUCT = require("../model/product");
const COUNTER = require("../model/barcodeCounter");
const crypto = require("crypto");

const generateShortId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const length = 8;
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      result += chars[randomIndex];
    }
    return result;
};

exports.createStockEntry = async (req, res) => {
  try {
    const { entryDate, supplier, invoiceNumber, product: productId, totalSets } = req.body;

    const product = await PRODUCT.findOne({ _id: productId, isDeleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found or has been deleted" });
    }

    // Determine Sequence Range (Global across ALL products) using Counter
    // This is robust against race conditions
    let counterObj = await COUNTER.findOne({ name: "stock_sequence" });
    if (!counterObj) {
        const lastItem = await INVENTORYITEM.findOne({}).sort({ sequenceNumber: -1 });
        const maxSeq = lastItem ? lastItem.sequenceNumber : 100000;
        counterObj = await COUNTER.create({ name: "stock_sequence", count: maxSeq });
    }

    // Atomic increment to handle concurrent requests
    const updatedCounter = await COUNTER.findOneAndUpdate(
        { name: "stock_sequence" },
        { $inc: { count: totalSets } },
        { new: true }
    );

    const startSequence = updatedCounter.count - totalSets + 1;
    const totalItems = totalSets; 
    const endSequence = updatedCounter.count;

    // Create Stock Entry Record
    const stockEntry = await STOCKENTRY.create({
      entryDate,
      supplier,
      invoiceNumber,
      product: productId,
      totalSets,
      totalItems: totalItems * (product.sizes?.length || 0),
      startSequence,
      endSequence,
      addedBy: req.user?._id
    });

    // Generate Inventory Items (8-character Alphanumeric Barcodes)
    const inventoryItems = [];
    for (let i = 0; i < totalItems; i++) {
      const currentSeq = startSequence + i;
      const alphanumericBarcode = generateShortId();
      
      inventoryItems.push({
        product: productId,
        stockEntry: stockEntry._id,
        barcode: alphanumericBarcode,
        sequenceNumber: currentSeq,
        status: "In Stock"
      });
    }

    await INVENTORYITEM.insertMany(inventoryItems);

    res.status(201).json({ 
      success: true, 
      message: `${totalSets} sets added. IDs: ${startSequence} to ${endSequence}`,
      data: stockEntry 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllStockEntries = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { isDeleted: { $ne: true } };
    const totalRecords = await STOCKENTRY.countDocuments(query);
    const data = await STOCKENTRY.find(query)
      .populate({ path: "product", populate: { path: "sizes" } })
      .populate("supplier")
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

exports.getProductInventory = async (req, res) => {
  try {
    const productId = req.params.productId;
    const status = req.query.status; // 'In Stock' or 'Sold'

    const query = { product: productId, isDeleted: { $ne: true } };
    if (status) {
      query.status = status;
    }

    const inventory = await INVENTORYITEM.find(query).sort({ sequenceNumber: 1 });
    
    res.status(200).json({
        success: true,
        data: inventory
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getStockEntryInventory = async (req, res) => {
  try {
    const entry = await STOCKENTRY.findById(req.params.entryId)
      .populate({ path: "product", populate: { path: "sizes" } })
      .populate("supplier");
    if (!entry) return res.status(404).json({ success: false, message: "Entry not found" });

    const items = await INVENTORYITEM.find({
      stockEntry: req.params.entryId,
      isDeleted: { $ne: true }
    }).sort({ sequenceNumber: 1 });

    res.status(200).json({ success: true, data: { entry, items } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteStockEntry = async (req, res) => {
  try {
    const entry = await STOCKENTRY.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!entry) {
      return res.status(404).json({ success: false, message: "Stock entry not found" });
    }

    // Cascade to inventory items
    await INVENTORYITEM.updateMany({ stockEntry: req.params.id }, { isDeleted: true });

    res.status(200).json({ success: true, message: "Stock entry and related barcodes removed" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
