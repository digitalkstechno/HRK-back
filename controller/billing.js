let BILLING = require("../model/billing");
let INVENTORYITEM = require("../model/inventoryItem");
let PRODUCT = require("../model/product");

exports.createBilling = async (req, res) => {
  try {
    const { customer, items, totalAmount } = req.body;
    
    // Generate Bill Number
    const billNumber = `BILL-${Date.now().toString().slice(-6)}`;

    const billing = await BILLING.create({ 
        billNumber,
        customer, 
        items,
        totalAmount
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
                productName: product.productCode,
                barcode: item.barcode, // Always return the unique string barcode
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
      .populate("customer")
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
    const billing = await BILLING.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).populate("customer");
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
    const { customer, scanBarcode, items } = req.body;
    const billing = await BILLING.findByIdAndUpdate(
      req.params.id,
      { customer, scanBarcode, items },
      { new: true }
    ).populate("customer");
    if (!billing) {
      return res.status(404).json({ success: false, message: "Billing not found" });
    }
    res.status(200).json({ success: true, data: billing });
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
