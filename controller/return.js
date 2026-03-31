const RETURN = require("../model/return");
const PRODUCT = require("../model/product");
const INVENTORYITEM = require("../model/inventoryItem");
const COUNTER = require("../model/barcodeCounter");
const { generateShortId } = require("../utils/barcode");

// GET /return/products-by-filter?designNo=&sku=&category=
exports.getProductsByFilter = async (req, res) => {
  try {
    const { designNo, sku, category } = req.query;
    const query = { isDeleted: { $ne: true } };
    if (designNo) query.designNo = { $regex: designNo, $options: "i" };
    if (sku) query.sku = { $regex: sku, $options: "i" };
    if (category) query.category = category;

    const products = await PRODUCT.find(query)
      .populate("sizes")
      .populate("category")
      .limit(20);

    res.status(200).json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /return/create — Generate barcodes for each piece
exports.createReturn = async (req, res) => {
  try {
    const { product: productId, sizes, returnDate } = req.body;

    if (!productId || !sizes?.length || !returnDate) {
      return res.status(400).json({ success: false, message: "product, sizes, returnDate required" });
    }

    const product = await PRODUCT.findOne({ _id: productId, isDeleted: { $ne: true } }).populate("sizes");
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const totalReturnItems = sizes.reduce((sum, s) => sum + s.qty, 0);

    // Get counter for sequence barcodes
    let counterObj = await COUNTER.findOne({ name: "stock_sequence" });
    if (!counterObj) {
        const lastItem = await INVENTORYITEM.findOne({}).sort({ sequenceNumber: -1 });
        const maxSeq = lastItem ? lastItem.sequenceNumber : 100000;
        counterObj = await COUNTER.create({ name: "stock_sequence", count: maxSeq });
    }

    // Atomic increment
    const updatedCounter = await COUNTER.findOneAndUpdate(
        { name: "stock_sequence" },
        { $inc: { count: totalReturnItems } },
        { new: true }
    );

    const startSequence = updatedCounter.count - totalReturnItems + 1;
    let sequenceIdx = 0;

    const inventoryBatch = [];
    const returnBatch = [];

    for (const s of sizes) {
        for (let i = 0; i < s.qty; i++) {
            const currentSeq = startSequence + sequenceIdx;
            const alphanumericBarcode = generateShortId();
            
            inventoryBatch.push({
                product: productId,
                barcode: alphanumericBarcode,
                sequenceNumber: currentSeq,
                status: product.sizes?.length === 1 ? "In Stock" : "Partial",
                availableSizes: [s.size],
                initialSizes: [s.size],
                isReturn: true // Flag to identify these came from returns
            });

            returnBatch.push({
                product: productId,
                size: s.size,
                qty: 1,
                returnDate,
                barcode: alphanumericBarcode,
                sequenceNumber: currentSeq
            });
            sequenceIdx++;
        }
    }

    // Save inventory items and return records
    const generatedInventory = await INVENTORYITEM.insertMany(inventoryBatch);
    const savedReturns = await RETURN.insertMany(returnBatch);

    res.status(201).json({ 
        success: true, 
        message: `${totalReturnItems} return pieces processed with new barcodes.`,
        data: savedReturns,
        barcodes: generatedInventory.map(i => ({ 
            barcode: i.barcode, 
            sequenceNumber: i.sequenceNumber, 
            sizeId: i.availableSizes[0] 
        }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllReturns = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { search } = req.query;

    const query = { isDeleted: { $ne: true } };

    if (search) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Find matching products
        const productIds = await PRODUCT.find({
            $or: [
                { designNo: { $regex: escapedSearch, $options: "i" } },
                { sku: { $regex: escapedSearch, $options: "i" } },
                { productCode: { $regex: escapedSearch, $options: "i" } }
            ]
        }).distinct("_id");

        query.$or = [
            { barcode: { $regex: escapedSearch, $options: "i" } },
            { product: { $in: productIds } }
        ];

        // If search is numeric, also search sequenceNumber
        if (!isNaN(search)) {
            query.$or.push({ sequenceNumber: Number(search) });
        }
    }

    const totalRecords = await RETURN.countDocuments(query);
    const data = await RETURN.find(query)
      .populate({ path: "product", populate: [{ path: "sizes" }, { path: "category" }] })
      .populate("size")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data,
      pagination: { totalRecords, currentPage: page, totalPages: Math.ceil(totalRecords / limit), limit },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchReturnById = async (req, res) => {
  try {
    const data = await RETURN.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate({ path: "product", populate: [{ path: "sizes" }, { path: "category" }] })
      .populate("size");
    if (!data) return res.status(404).json({ success: false, message: "Return not found" });
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteReturn = async (req, res) => {
  try {
    const data = await RETURN.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!data) return res.status(404).json({ success: false, message: "Return not found" });

    // If return is deleted, also delete the corresponding barcode from inventory
    if (data.barcode) {
      await INVENTORYITEM.findOneAndUpdate({ barcode: data.barcode }, { isDeleted: true });
    }

    res.status(200).json({ success: true, message: "Return and associated barcode deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
