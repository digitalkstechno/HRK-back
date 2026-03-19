let BILLING = require("../model/billing");
let INVENTORYITEM = require("../model/inventoryItem");
let PRODUCT = require("../model/product");
const { generatePackingSlipPDF } = require("../utils/packingSlip");

exports.createBilling = async (req, res) => {
  try {
    const { 
      customer, 
      items, 
      totalAmount, 
      subtotal, 
      discountPercent, 
      gstEnabled, 
      gstPercent 
    } = req.body;
    
    // Generate Slip Number
    const lastSlip = await BILLING.findOne({}).sort({ createdAt: -1 });
    let slipNumber = 1000;
    if (lastSlip && lastSlip.billNumber && lastSlip.billNumber.startsWith("SLIP-")) {
        const lastNum = parseInt(lastSlip.billNumber.split("-")[1]);
        if (!isNaN(lastNum)) {
            slipNumber = lastNum + 1;
        }
    }
    const billNumber = `SLIP-${slipNumber}`;

    const billing = await BILLING.create({ 
        billNumber,
        customer, 
        items,
        totalAmount,
        subtotal,
        discountPercent,
        gstEnabled,
        gstPercent
    });

    // Update Inventory Items to 'Sold'
    const barcodes = items.map(item => item.barcode);
    await INVENTORYITEM.updateMany(
        { barcode: { $in: barcodes } },
        { status: "Sold", soldDate: new Date(), billId: billing._id }
    );

    res.status(201).json({ success: true, data: billing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.scanBarcode = async (req, res) => {
    try {
        const { barcode } = req.params;
        
        // Find by alphanumeric barcode OR sequential ID
        const item = await INVENTORYITEM.findOne({
            $or: [{ barcode: barcode }, { sequenceNumber: Number(barcode) || 0 }],
            isDeleted: { $ne: true }
        }).populate("product");

        if (!item) {
            return res.status(404).json({ success: false, message: "Barcode not recognized" });
        }

        if (item.status === "Sold") {
            return res.status(400).json({ success: false, message: "This item is already sold" });
        }

        const product = item.product;
        // Qty = number of sizes (as per user: "jitne size hoge utni qty ham show karege")
        const qty = product.sizes?.length || 1; 

        res.status(200).json({
            success: true,
            data: {
                productId: product._id,
                productName: `${product.productCode} (${product.sizes?.map(s => s.name).join(", ")})`,
                barcode: item.barcode, 
                sequenceNumber: item.sequenceNumber,
                qty: qty,
                price: product.salePrice,
                total: product.salePrice * qty
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.fetchAllBillings = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      isDeleted: { $ne: true },
      $or: [
        { billNumber: { $regex: search, $options: "i" } },
      ],
    };

    const totalRecords = await BILLING.countDocuments(query);
    const data = await BILLING.find(query)
      .populate({ path: "customer", populate: { path: "transport" } })
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


exports.fetchBillingById = async (req, res) => {
  try {
    const billing = await BILLING.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate({ path: "customer", populate: { path: "transport" } });
    if (!billing) {
      return res.status(404).json({ success: false, message: "Billing not found" });
    }
    res.status(200).json({ success: true, data: billing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateBilling = async (req, res) => {
  try {
    const { 
      customer, 
      items, 
      totalAmount,
      subtotal,
      discountPercent,
      gstEnabled,
      gstPercent
    } = req.body;
    
    // 1. Find existing billing
    const oldBilling = await BILLING.findById(req.params.id);
    if (!oldBilling) {
        return res.status(404).json({ success: false, message: "Billing not found" });
    }

    // 2. Revert Old Items status to 'In Stock'
    const oldBarcodes = oldBilling.items.map(i => i.barcode);
    await INVENTORYITEM.updateMany(
        { barcode: { $in: oldBarcodes } },
        { status: "In Stock", $unset: { soldDate: "", billId: "" } }
    );

    // 3. Update Billing with new data
    const updatedBilling = await BILLING.findByIdAndUpdate(
      req.params.id,
      { 
        customer, 
        items, 
        totalAmount, 
        subtotal,
        discountPercent,
        gstEnabled,
        gstPercent,
        isDeleted: false 
      }, 
      { new: true }
    ).populate("customer");

    // 4. Mark New Items as 'Sold'
    const newBarcodes = items.map(i => i.barcode);
    await INVENTORYITEM.updateMany(
        { barcode: { $in: newBarcodes } },
        { status: "Sold", soldDate: new Date(), billId: updatedBilling._id }
    );

    res.status(200).json({ success: true, data: updatedBilling });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generatePackingSlip = async (req, res) => {
  try {
    const billing = await BILLING.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate({ path: "customer", populate: { path: "transport" } })
      .populate({ path: "items.product", populate: { path: "sizes", model: "SizeMaster", select: "name" } });
    if (!billing) {
      return res.status(404).json({ success: false, message: "Billing not found" });
    }
    generatePackingSlipPDF(billing, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBilling = async (req, res) => {
  try {
    const billing = await BILLING.findById(req.params.id);
    if (!billing) {
      return res.status(404).json({ success: false, message: "Billing not found" });
    }

    // Revert Inventory Items to 'In Stock'
    const barcodes = billing.items.map(item => item.barcode);
    await INVENTORYITEM.updateMany(
        { barcode: { $in: barcodes } },
        { status: "In Stock", $unset: { soldDate: "", billId: "" } }
    );

    billing.isDeleted = true;
    await billing.save();

    res.status(200).json({ success: true, message: "Billing deleted and stock reverted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
