let mongoose = require("mongoose");
let BILLING = require("../model/billing");
let INVENTORYITEM = require("../model/inventoryItem");
let PRODUCT = require("../model/product");
let ORDER_BOOKING = require("../model/orderBooking");
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
      gstPercent,
      fulfilledReservationIds = []
    } = req.body;
    
    // --- QUOTA VALIDATION ---
    const productIds = Array.from(new Set(items.map(i => i.product)));
    const RETURN = require("../model/return");
    for (const pId of productIds) {
        const itemQtyInBill = items.filter(i => i.product.toString() === pId.toString()).length;
        const productInfo = await PRODUCT.findById(pId).populate("sizes");
        
        // 1. Calculate Physical Sets (Minimum across sizes) - Now including BOTH In Stock and Reserved items
        const physicalInInv = await INVENTORYITEM.countDocuments({ 
            product: pId, 
            status: { $in: ["In Stock", "Reserved"] }, 
            isDeleted: { $ne: true } 
        });
        
        const sizeCounts = await Promise.all((productInfo.sizes || []).map(async (s) => {
            const sizeReturnAgg = await RETURN.aggregate([
                { $match: { product: new mongoose.Types.ObjectId(pId), size: new mongoose.Types.ObjectId(s._id), isDeleted: { $ne: true } } },
                { $group: { _id: null, total: { $sum: "$qty" } } },
            ]);
            const sReturn = sizeReturnAgg[0]?.total || 0;
            return physicalInInv + sReturn;
        }));
        const totalPhysicalSets = sizeCounts.length > 0 ? Math.min(...sizeCounts) : physicalInInv;

        // 2. Calculate Reservations by Others
        const reservesByOthers = await ORDER_BOOKING.aggregate([
            { $match: { 
                product: new mongoose.Types.ObjectId(pId), 
                customer: { $ne: new mongoose.Types.ObjectId(customer) }, 
                isDeleted: { $ne: true }, 
                status: "Hold" 
            } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const reservedCountOthers = reservesByOthers[0]?.total || 0;
        
        const availableForMe = totalPhysicalSets - reservedCountOthers;

        console.log(`[DEBUG] Product: ${productInfo.productCode}`);
        console.log(`[DEBUG] Total Physical Sets (Min size): ${totalPhysicalSets}`);
        console.log(`[DEBUG] Reserved By Others: ${reservedCountOthers}`);
        console.log(`[DEBUG] Attempted in Bill: ${itemQtyInBill}`);
        console.log(`[DEBUG] Final Available for Me: ${availableForMe}`);

        if (availableForMe < itemQtyInBill) {
            return res.status(400).json({ 
                success: false, 
                message: `Availability Limit: Only ${availableForMe} sets of ${productInfo.productCode} are available. Remaining stock is reserved.` 
            });
        }
    }

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

    try {
        if (fulfilledReservationIds.length > 0) {
            await ORDER_BOOKING.updateMany(
                { 
                    _id: { $in: fulfilledReservationIds.map(id => new mongoose.Types.ObjectId(id)) },
                    status: "Hold" 
                },
                { status: "Closed" }
            );
        }
    } catch (bookingError) {
        console.error("Non-critical Error closing order bookings:", bookingError.message);
        // We don't crash the response because the Bill is already created successfully.
    }

    res.status(201).json({ success: true, data: billing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.scanBarcode = async (req, res) => {
    try {
        const { barcode } = req.params;
        
        const item = await INVENTORYITEM.findOne({
            $or: [{ barcode: barcode }, { sequenceNumber: Number(barcode) || 0 }],
            isDeleted: { $ne: true }
        }).populate({ path: "product", populate: { path: "sizes", select: "name" } });

        if (!item) {
            return res.status(404).json({ success: false, message: "Barcode not recognized" });
        }

        if (item.status === "Sold") {
            return res.status(400).json({ success: false, message: "This item is already sold" });
        }

        const product = item.product;
        // Check Reservation Quota
        const currentCustomerId = req.query.customerId;
        const alreadyScanned = parseInt(req.query.alreadyScanned) || 0;
        const selectedReservations = req.query.selectedReservations || [];
        const reservationIds = Array.isArray(selectedReservations) ? selectedReservations : [selectedReservations];

        const RETURN = require("../model/return");
        const inStockCount = await INVENTORYITEM.countDocuments({ product: product._id, status: "In Stock", isDeleted: { $ne: true } });
        const returnAgg = await RETURN.aggregate([
            { $match: { product: product._id, isDeleted: { $ne: true } } },
            { $group: { _id: null, total: { $sum: "$qty" } } },
        ]);
        const returnQty = returnAgg[0]?.total || 0;
        const totalPhysicalOnPage = inStockCount + returnQty;
        
        // Find my reservations (Total for this product)
        const reservesByMeAgg = await ORDER_BOOKING.aggregate([
            { $match: { 
                product: product._id, 
                customer: currentCustomerId ? new mongoose.Types.ObjectId(currentCustomerId) : null, 
                isDeleted: { $ne: true }, 
                status: "Hold" 
            } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const myTotalReservation = reservesByMeAgg[0]?.total || 0;

        // Calculate total for specifically SELECTED reservations for this product
        const selectedMyReservesAgg = reservationIds.length > 0 ? await ORDER_BOOKING.aggregate([
            { $match: { 
                _id: { $in: reservationIds.filter(id => id && id.length === 24).map(id => new mongoose.Types.ObjectId(id)) },
                product: product._id, 
                isDeleted: { $ne: true }, 
                status: "Hold" 
            } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]) : [];
        const selectedReservationTotal = selectedMyReservesAgg[0]?.total || 0;

        // Find others' reservations
        const reservesByOthers = await ORDER_BOOKING.aggregate([
            { $match: { 
                product: product._id, 
                customer: { $ne: currentCustomerId ? new mongoose.Types.ObjectId(currentCustomerId) : null }, 
                isDeleted: { $ne: true }, 
                status: "Hold" 
            } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const reservedCountOthers = reservesByOthers[0]?.total || 0;

        let availableQuota;
        let isReserved = selectedReservationTotal > 0;
        
        if (isReserved) {
            // SCENARIO 1: User is filling SPECIFIC selected reservation rows
            availableQuota = selectedReservationTotal;
        } else {
            // SCENARIO 2: Regular scan (must use unreserved stock)
            // Available = Physical - Others' Reservations - My own Reservations (since I'm not explicitly filling them via selection)
            availableQuota = totalPhysicalOnPage - reservedCountOthers - myTotalReservation;
        }

        if (availableQuota <= alreadyScanned) {
            return res.status(400).json({ 
                success: false, 
                message: isReserved 
                    ? `Order Limit: You already scanned ${alreadyScanned} of the ${myTotalReservation} reserved sets for ${product.productCode}.`
                    : `Availability Limit: Only ${Math.max(0, availableQuota)} unreserved sets of ${product.productCode} are currently available. Existing stock is reserved (some by you).` 
            });
        }

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
                total: product.salePrice * qty,
                availableQuota: availableQuota,
                sizes: product.sizes
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
      .populate({ path: "customer", populate: { path: "transport" } })
      .populate({ path: "items.product", populate: { path: "sizes", select: "name" } });
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
      gstPercent,
      fulfilledReservationIds = []
    } = req.body;
    
    const oldBilling = await BILLING.findById(req.params.id);
    if (!oldBilling) {
        return res.status(404).json({ success: false, message: "Billing not found" });
    }

    // --- QUOTA VALIDATION (considering items already in stock because we haven't reverted yet) ---
    const productIds = Array.from(new Set(items.map(i => i.product)));
    const RETURN = require("../model/return");
    for (const pId of productIds) {
        const itemQtyInBill = items.filter(i => i.product.toString() === pId.toString()).length;
        const oldQtyInBill = oldBilling.items.filter(i => i.product.toString() === pId.toString()).length;
        const productInfo = await PRODUCT.findById(pId).populate("sizes");
        
        // 1. Calculate Physical Sets (Minimum across sizes) - Now including BOTH In Stock and Reserved items
        const physicalInInv = await INVENTORYITEM.countDocuments({ 
            product: pId, 
            status: { $in: ["In Stock", "Reserved"] }, 
            isDeleted: { $ne: true } 
        });
        
        const sizeCounts = await Promise.all((productInfo.sizes || []).map(async (s) => {
            const sizeReturnAgg = await RETURN.aggregate([
                { $match: { product: new mongoose.Types.ObjectId(pId), size: new mongoose.Types.ObjectId(s._id), isDeleted: { $ne: true } } },
                { $group: { _id: null, total: { $sum: "$qty" } } },
            ]);
            return physicalInInv + (sizeReturnAgg[0]?.total || 0);
        }));
        const totalPhysicalSets = sizeCounts.length > 0 ? Math.min(...sizeCounts) : physicalInInv;
        const totalPotentiallyAvailable = totalPhysicalSets + oldQtyInBill;

        // 2. Calculate Reservations by Others
        const reservesByOthersAgg = await ORDER_BOOKING.aggregate([
            { $match: { 
                product: new mongoose.Types.ObjectId(pId), 
                customer: { $ne: new mongoose.Types.ObjectId(customer) }, 
                isDeleted: { $ne: true }, 
                status: "Hold" 
            } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const reservedCountOthers = reservesByOthersAgg[0]?.total || 0;
        
        const availableForMe = totalPotentiallyAvailable - reservedCountOthers;

        if (availableForMe < itemQtyInBill) {
            return res.status(400).json({ 
                success: false, 
                message: `Availability Limit: Only ${availableForMe} sets of ${productInfo.productCode} are available. Remaining stock is reserved.` 
            });
        }
    }

    // Revert Old Items status to 'In Stock'
    const oldBarcodes = oldBilling.items.map(i => i.barcode);
    await INVENTORYITEM.updateMany(
        { barcode: { $in: oldBarcodes } },
        { status: "In Stock", $unset: { soldDate: "", billId: "" } }
    );

    // Update Billing
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

    // Mark New Items as 'Sold'
    const newBarcodes = items.map(i => i.barcode);
    await INVENTORYITEM.updateMany(
        { barcode: { $in: newBarcodes } },
        { status: "Sold", soldDate: new Date(), billId: updatedBilling._id }
    );

    try {
        if (fulfilledReservationIds.length > 0) {
            await ORDER_BOOKING.updateMany(
                { 
                    _id: { $in: fulfilledReservationIds.map(id => new mongoose.Types.ObjectId(id)) },
                    status: "Hold" 
                },
                { status: "Closed" }
            );
        }
    } catch (bookingError) {
        console.error("Non-critical Error closing order bookings during update:", bookingError.message);
    }

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
