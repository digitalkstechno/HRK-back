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

        // 2. Calculate All Reservations for this product
        const allReservQuery = { 
            product: new mongoose.Types.ObjectId(pId), 
            isDeleted: { $ne: true }, 
            status: "Hold" 
        };

        const totalReservedAgg = await ORDER_BOOKING.aggregate([
            { $match: allReservQuery },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const totalReservedAll = totalReservedAgg[0]?.total || 0;

        // 3. Calculate specifically SELECTED reservations for CURRENT billing
        const selectedResIds = (fulfilledReservationIds || []).filter(id => id && id.length === 24);
        const selectedResAgg = await ORDER_BOOKING.aggregate([
            { $match: { 
                _id: { $in: selectedResIds.map(id => new mongoose.Types.ObjectId(id)) },
                product: new mongoose.Types.ObjectId(pId),
                status: "Hold"
            } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const selectedResTotal = selectedResAgg[0]?.total || 0;

        // 4. Formula: Strict Separation
        let availableForMe;
        let quotaMessage = "";
        if (selectedResTotal > 0) {
            // Fulfilling specific reservation -> Limit is ONLY the reserved qty
            availableForMe = selectedResTotal;
            quotaMessage = `Your selected reservation limit for ${productInfo.productCode} is ${selectedResTotal} sets.`;
        } else {
            // General scan -> Limit is unreserved stock
            availableForMe = Math.max(0, totalPhysicalSets - totalReservedAll);
            quotaMessage = `Unreserved Availability: Only ${availableForMe} sets of ${productInfo.productCode} are currently free for non-reserved billing.`;
        }

        console.log(`[DEBUG] Final Available for Me: ${availableForMe}`);

        if (availableForMe < itemQtyInBill) {
            const extraMsg = selectedResTotal > 0 
                ? `You scanned ${itemQtyInBill} pieces but only ${selectedResTotal} are selected for fulfillment. Please uncheck reservation or reduce quantity.` 
                : "Remaining stock is reserved for other orders.";
            return res.status(400).json({ 
                success: false, 
                message: `${quotaMessage} ${extraMsg}` 
            });
        }
    }

    // Generate Slip Number
    const lastSlip = await BILLING.findOne({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
    let slipNumber = 1;
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

    // Update Inventory Items status and available sizes
    for (const item of items) {
        const invItem = await INVENTORYITEM.findOne({ barcode: item.barcode });
        if (invItem) {
            // Filter out the sizes being sold in this bill
            const soldSizeIds = (item.soldSizes || []).map(id => id.toString());
            invItem.availableSizes = invItem.availableSizes.filter(sId => !soldSizeIds.includes(sId.toString()));
            
            if (invItem.availableSizes.length === 0) {
                invItem.status = "Sold";
                invItem.soldDate = new Date();
                invItem.billId = billing._id;
            } else {
                invItem.status = "Partial";
            }
            await invItem.save();
        }
    }

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
        }).populate({ path: "product", populate: { path: "sizes", select: "name" } })
        .populate({ path: "availableSizes", select: "name" });

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
        const inStockCount = await INVENTORYITEM.countDocuments({ product: product._id, status: { $in: ["In Stock", "Partial"] }, isDeleted: { $ne: true } });
        const returnAgg = await RETURN.aggregate([
            { $match: { product: product._id, isDeleted: { $ne: true } } },
            { $group: { _id: null, total: { $sum: "$qty" } } },
        ]);
        const returnQty = returnAgg[0]?.total || 0;
        const totalPhysicalOnPage = inStockCount + returnQty;
        
        // Find my reservations (Total for this product)
        const isValideCustomerId = currentCustomerId && currentCustomerId.length === 24;
        const reservesByMeAgg = await ORDER_BOOKING.aggregate([
            { $match: { 
                product: product._id, 
                customer: isValideCustomerId ? new mongoose.Types.ObjectId(currentCustomerId) : null, 
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
        const othersReservMatch = { 
            product: product._id, 
            isDeleted: { $ne: true }, 
            status: "Hold" 
        };
        if (currentCustomerId && currentCustomerId.length === 24) {
            othersReservMatch.customer = { $ne: new mongoose.Types.ObjectId(currentCustomerId) };
        }

        const reservesByOthers = await ORDER_BOOKING.aggregate([
            { $match: othersReservMatch },
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
            // If scanning for a customer, we allow them to scan their OWN reserved stock 
            // even if not explicitly selected yet (to avoid friction).
            availableQuota = totalPhysicalOnPage - reservedCountOthers; 
            // We NO LONGER subtract myTotalReservation here if currentCustomerId is present.
        }

        if (availableQuota <= alreadyScanned) {
            return res.status(400).json({ 
                success: false, 
                message: isReserved 
                    ? `Order Limit: You already scanned ${alreadyScanned} of the ${myTotalReservation} reserved sets for ${product.productCode}.`
                    : `Availability Limit: Only ${Math.max(0, availableQuota)} sets of ${product.productCode} are currently available. Remaining stock is reserved by other customers.` 
            });
        }

        const qty = item.availableSizes?.length || product.sizes?.length || 1; 

        res.status(200).json({
            success: true,
            data: {
                productId: product._id,
                productName: `${product.productCode} (${product.sizes?.map(s => s.name).join(", ")})`,
                barcode: item.barcode, 
                sequenceNumber: item.sequenceNumber,
                qty: qty,
                availableSizes: item.availableSizes,
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

        // 2. Calculate All Reservations for this product
        const allReservQuery = { 
            product: new mongoose.Types.ObjectId(pId), 
            isDeleted: { $ne: true }, 
            status: "Hold" 
        };

        const totalReservedAgg = await ORDER_BOOKING.aggregate([
            { $match: allReservQuery },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const totalReservedAll = totalReservedAgg[0]?.total || 0;

        // 3. Calculate specifically SELECTED reservations
        const selectedResIds = (fulfilledReservationIds || []).filter(id => id && id.length === 24);
        const selectedResAgg = await ORDER_BOOKING.aggregate([
            { $match: { 
                _id: { $in: selectedResIds.map(id => new mongoose.Types.ObjectId(id)) },
                product: new mongoose.Types.ObjectId(pId),
                status: "Hold"
            } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const selectedResTotal = selectedResAgg[0]?.total || 0;

        // 4. Formula: Strict Separation (Including Old Qty)
        let availableForMe;
        let quotaMessage = "";
        if (selectedResTotal > 0) {
            availableForMe = selectedResTotal + oldQtyInBill;
            quotaMessage = `Your reservation limit (+ existing) for ${productInfo.productCode} is ${availableForMe} sets.`;
        } else {
            availableForMe = Math.max(0, totalPhysicalSets - totalReservedAll) + oldQtyInBill;
            quotaMessage = `Unreserved Availability (+ existing): Only ${availableForMe} sets of ${productInfo.productCode} are free.`;
        }

        if (availableForMe < itemQtyInBill) {
            const extraMsg = selectedResTotal > 0 
            ? `You attempted to bill ${itemQtyInBill} but only ${availableForMe} are permitted under this reservation. Check scanned items.` 
            : "Remaining stock is reserved.";
            return res.status(400).json({ 
                success: false, 
                message: `${quotaMessage} ${extraMsg}` 
            });
        }
    }

    // Revert Old Items status to 'In Stock' or 'Partial'
    for (const item of oldBilling.items) {
        const invItem = await INVENTORYITEM.findOne({ barcode: item.barcode });
        const product = await PRODUCT.findById(invItem.product);
        if (invItem && product) {
            // Add back the sold sizes from the old bill
            const oldSoldSizes = (item.soldSizes || []).map(s => s.toString());
            const currentAvailableSizes = invItem.availableSizes.map(s => s.toString());
            const combinedSizes = Array.from(new Set([...currentAvailableSizes, ...oldSoldSizes]));
            
            invItem.availableSizes = combinedSizes;
            
            if (invItem.availableSizes.length >= product.sizes.length) {
                invItem.status = "In Stock";
            } else {
                invItem.status = "Partial";
            }
            invItem.soldDate = undefined;
            invItem.billId = undefined;
            await invItem.save();
        }
    }

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

    // Mark New Items as 'Sold' or 'Partial'
    for (const item of items) {
        const invItem = await INVENTORYITEM.findOne({ barcode: item.barcode });
        if (invItem) {
            // Filter out the sizes being sold in this bill
            const soldSizeIds = (item.soldSizes || []).map(id => id.toString());
            invItem.availableSizes = invItem.availableSizes.filter(sId => !soldSizeIds.includes(sId.toString()));
            
            if (invItem.availableSizes.length === 0) {
                invItem.status = "Sold";
                invItem.soldDate = new Date();
                invItem.billId = updatedBilling._id;
            } else {
                invItem.status = "Partial";
                invItem.soldDate = undefined;
                invItem.billId = undefined; // For partial, we might not track which bill it's in clearly, but let's keep it this way
            }
            await invItem.save();
        }
    }

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

    // Revert items before deleting bill
    for (const item of billing.items) {
        const invItem = await INVENTORYITEM.findOne({ barcode: item.barcode });
        const product = await PRODUCT.findById(invItem.product);
        if (invItem && product) {
            // Add back the sold sizes from the bill
            const oldSoldSizes = (item.soldSizes || []).map(s => s.toString());
            const currentAvailableSizes = invItem.availableSizes.map(s => s.toString());
            const combinedSizes = Array.from(new Set([...currentAvailableSizes, ...oldSoldSizes]));
            
            invItem.availableSizes = combinedSizes;
            
            if (invItem.availableSizes.length >= product.sizes.length) {
                invItem.status = "In Stock";
            } else {
                invItem.status = "Partial";
            }
            invItem.soldDate = undefined;
            invItem.billId = undefined;
            await invItem.save();
        }
    }

    billing.isDeleted = true;
    await billing.save();

    res.status(200).json({ success: true, message: "Billing deleted and stock reverted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
