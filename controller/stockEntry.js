const STOCKENTRY = require("../model/stockEntry");
const INVENTORYITEM = require("../model/inventoryItem");
const PRODUCT = require("../model/product");
const COUNTER = require("../model/barcodeCounter");
const { generateShortId } = require("../utils/barcode");
const mongoose = require("mongoose");

exports.createStockEntry = async (req, res) => {
  try {
    const { entryDate, supplier, invoiceNumber, product: productId, totalSets, partialSets = [] } = req.body;

    const product = await PRODUCT.findOne({ _id: productId, isDeleted: { $ne: true } }).populate("sizes");
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found or has been deleted" });
    }

    const totalBarcodes = totalSets + partialSets.length;

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
        { $inc: { count: totalBarcodes } },
        { new: true }
    );

    const startSequence = updatedCounter.count - totalBarcodes + 1;
    const endSequence = updatedCounter.count;

    // Calculate total items (sum of sizes in each barcode)
    const fullSetsItems = totalSets * (product.sizes?.length || 0);
    const partialSetsItems = partialSets.reduce((sum, set) => sum + (set.sizes?.length || 0), 0);
    const totalItemsCount = fullSetsItems + partialSetsItems;

    // Create Stock Entry Record
    const stockEntry = await STOCKENTRY.create({
      entryDate,
      supplier,
      invoiceNumber,
      product: productId,
      totalSets: totalBarcodes, // Total barcodes created
      totalItems: totalItemsCount,
      startSequence,
      endSequence,
      addedBy: req.user?._id
    });

    // Generate Inventory Items (8-character Alphanumeric Barcodes)
    const inventoryItems = [];
    
    // Create barcodes for full sets
    for (let i = 0; i < totalSets; i++) {
      const currentSeq = startSequence + i;
      const alphanumericBarcode = generateShortId();
      
      inventoryItems.push({
        product: productId,
        stockEntry: stockEntry._id,
        barcode: alphanumericBarcode,
        sequenceNumber: currentSeq,
        status: "In Stock",
        availableSizes: product.sizes.map(s => s._id),
        initialSizes: product.sizes.map(s => s._id)
      });
    }

    // Create barcodes for partial sets
    for (let i = 0; i < partialSets.length; i++) {
        const currentSeq = startSequence + totalSets + i;
        const alphanumericBarcode = generateShortId();
        
        inventoryItems.push({
          product: productId,
          stockEntry: stockEntry._id,
          barcode: alphanumericBarcode,
          sequenceNumber: currentSeq,
          status: "In Stock",
          availableSizes: partialSets[i].sizes,
          initialSizes: partialSets[i].sizes
        });
    }

    await INVENTORYITEM.insertMany(inventoryItems);

    res.status(201).json({ 
      success: true, 
      message: `${totalBarcodes} barcodes added. IDs: ${startSequence} to ${endSequence}`,
      data: stockEntry,
      barcodes: inventoryItems.map(i => ({
          barcode: i.barcode,
          sequenceNumber: i.sequenceNumber,
          isPartial: i.availableSizes.length < product.sizes.length,
          sizeNames: product.sizes.filter(s => i.availableSizes.includes(s._id)).map(s => s.name)
      }))
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
    const search = req.query.search || "";

    let query = { isDeleted: { $ne: true } };

    if (search) {
        // Find products matching search to filter by product code/design
        const matchingProducts = await PRODUCT.find({
            isDeleted: { $ne: true },
            $or: [
                { designNo: { $regex: search, $options: "i" } },
                { sku: { $regex: search, $options: "i" } },
                { productCode: { $regex: search, $options: "i" } },
            ]
        }).select("_id");
        
        const productIds = matchingProducts.map(p => p._id);
        
        query.$or = [
            { invoiceNumber: { $regex: search, $options: "i" } },
            { product: { $in: productIds } }
        ];
    }

    const [totalRecords, data] = await Promise.all([
      STOCKENTRY.countDocuments(query),
      STOCKENTRY.find(query)
        .populate({ path: "product", populate: { path: "sizes" } })
        .populate("supplier")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
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
    const entry = await STOCKENTRY.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: "Stock entry not found" });
    }

    // Check if any inventory item from this stock entry has been used (Sold, Reserved, or Partial)
    const usedItems = await INVENTORYITEM.findOne({
        stockEntry: req.params.id,
        isDeleted: { $ne: true },
        status: { $ne: "In Stock" }
    });

    if (usedItems) {
        return res.status(400).json({ 
            success: false, 
            message: "Cannot delete Stock Entry: Some barcodes from this entry have already been sold, reserved, or partially used." 
        });
    }

    // Check if this was the latest entry to rollback sequence counter
    let counterObj = await COUNTER.findOne({ name: "stock_sequence" });
    if (counterObj && counterObj.count === entry.endSequence) {
        // Safe to rollback because no newer barcodes exist
        counterObj.count = entry.startSequence - 1;
        await counterObj.save();
    }

    entry.isDeleted = true;
    await entry.save();

    // Cascade to inventory items
    await INVENTORYITEM.updateMany({ stockEntry: req.params.id }, { isDeleted: true });

    res.status(200).json({ success: true, message: "Stock entry removed and sequence counter adjusted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchInventoryItems = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";
        const status = req.query.status;
        const productId = req.query.productId;
        const sizeId = req.query.sizeId || req.query['sizeId[]'];

        const query = { isDeleted: { $ne: true } };
        if (search) {
            const productQuery = await PRODUCT.find({
                $or: [
                    { designNo: { $regex: search, $options: "i" } },
                    { sku: { $regex: search, $options: "i" } },
                    { productCode: { $regex: search, $options: "i" } }
                ]
            }).select("_id");
            const productIdsFromSearch = productQuery.map(p => p._id);

            query.$or = [
                { barcode: { $regex: search, $options: "i" } },
                { sequenceNumber: Number(search) || -1 },
                { product: { $in: productIdsFromSearch } }
            ];
        }
        if (status) query.status = status;
        if (productId) {
            query.product = new mongoose.Types.ObjectId(productId);
        }
        
        if (sizeId) {
            // Handle multiple sizeIds if passed as array, comma separated string, 
            // or bracket format sizeId[]
            const sizeArr = Array.isArray(sizeId) ? sizeId : sizeId.split(",");
            
            // Explicitly convert string IDs to ObjectIds for correct matching in aggregation
            query.availableSizes = { 
                $in: sizeArr.map(id => {
                    try {
                        return new mongoose.Types.ObjectId(id);
                    } catch (e) {
                        return id;
                    }
                })
            };
        }

        const totalRecords = await INVENTORYITEM.countDocuments(query);
        
        let sort = { sequenceNumber: -1 };
        
        // Custom prioritization: if product and size are selected, 
        // show barcodes with SMALLER availableSizes count first (prioritizing single pieces)
        if (productId && sizeId) {
            // We use aggregation for complex conditional sorting
            const data = await INVENTORYITEM.aggregate([
                { $match: query },
                {
                    $addFields: {
                        availableCount: { $size: "$availableSizes" }
                    }
                },
                { $sort: { availableCount: 1, sequenceNumber: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $lookup: {
                        from: "products",
                        localField: "product",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                { $unwind: "$product" },
                {
                    $lookup: {
                        from: "sizemasters",
                        localField: "product.sizes",
                        foreignField: "_id",
                        as: "product.sizes"
                    }
                },
                {
                    $lookup: {
                        from: "sizemasters",
                        localField: "availableSizes",
                        foreignField: "_id",
                        as: "availableSizes"
                    }
                },
                {
                    $lookup: {
                        from: "sizemasters",
                        localField: "lostSizes",
                        foreignField: "_id",
                        as: "lostSizes"
                    }
                },
                {
                    $lookup: {
                        from: "sizemasters",
                        localField: "initialSizes",
                        foreignField: "_id",
                        as: "initialSizes"
                    }
                }
            ]);

            return res.status(200).json({
                success: true,
                data,
                pagination: { totalRecords, currentPage: page, totalPages: Math.ceil(totalRecords / limit), limit }
            });
        }

        const data = await INVENTORYITEM.find(query)
            .populate({ path: "product", populate: { path: "sizes" } })
            .populate("availableSizes")
            .populate("lostSizes")
            .populate("initialSizes")
            .sort(sort)
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            data,
            pagination: { totalRecords, currentPage: page, totalPages: Math.ceil(totalRecords / limit), limit }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.markSizeLost = async (req, res) => {
    try {
        const { id } = req.params;
        const { sizeIds } = req.body; // Array of size IDs to mark as lost

        const invItem = await INVENTORYITEM.findById(id);
        if (!invItem) return res.status(404).json({ success: false, message: "Inventory Item not found" });

        const product = await PRODUCT.findById(invItem.product);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        // Move from available to lost
        const sizesToLose = sizeIds.map(sid => sid.toString());
        
        invItem.availableSizes = invItem.availableSizes.filter(s => !sizesToLose.includes(s.toString()));
        
        // Add to lostSizes (avoid duplicates)
        const currentLost = invItem.lostSizes.map(s => s.toString());
        invItem.lostSizes = Array.from(new Set([...currentLost, ...sizesToLose]));

        // Update status
        if (invItem.availableSizes.length === 0) {
            invItem.status = "Sold"; // Or "Lost"? Using Sold for simplicity in current flow
        } else if (invItem.availableSizes.length < product.sizes.length) {
            invItem.status = "Partial";
        }

        await invItem.save();

        res.status(200).json({ success: true, message: "Sizes marked as lost", data: invItem });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
