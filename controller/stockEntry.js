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
    const { entryDate, supplierName, invoiceNumber, product: productId, totalSets } = req.body;

    const product = await PRODUCT.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Determine Sequence Range per PRODUCT
    // Find the highest sequence number used for THIS specific product
    const lastItem = await INVENTORYITEM.findOne({ product: productId })
      .sort({ sequenceNumber: -1 });

    const startSequence = lastItem ? lastItem.sequenceNumber + 1 : 100001;
    const totalItems = totalSets; 
    const endSequence = startSequence + totalItems - 1;

    // Create Stock Entry Record
    const stockEntry = await STOCKENTRY.create({
      entryDate,
      supplierName,
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

    const totalRecords = await STOCKENTRY.countDocuments();
    const data = await STOCKENTRY.find()
      .populate("product")
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

    const query = { product: productId };
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
