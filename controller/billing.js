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
    
    // --- QUOTA & FULFILLMENT VALIDATION ---
    const selectedResIds = (fulfilledReservationIds || []).filter(id => id && id.length === 24);
    
    // 1. Get all selected reservations to check products and required quantities
    const selectedResDocs = await ORDER_BOOKING.find({
        _id: { $in: selectedResIds.map(id => new mongoose.Types.ObjectId(id)) },
        status: "Hold"
    });

    const reservationRequirements = new Map(); // pId -> requiredSets
    selectedResDocs.forEach(res => {
        const pId = res.product.toString();
        reservationRequirements.set(pId, (reservationRequirements.get(pId) || 0) + res.totalSets);
    });

    // 2. Validate Scanned Items against Reservations and Unreserved Stock
    const scannedProductIds = Array.from(new Set(items.map(i => i.product.toString())));
    
    // Combine all products that are either scanned or reserved
    const allRelevantProductIds = Array.from(new Set([...scannedProductIds, ...reservationRequirements.keys()]));
    const productsInvolved = await PRODUCT.find({ _id: { $in: allRelevantProductIds } });
    const uniqueCodes = Array.from(new Set(productsInvolved.map(p => p.productCode)));

    const RETURN = require("../model/return");
    for (const code of uniqueCodes) {
        const productsWithSameCode = await PRODUCT.find({ productCode: code });
        const idsWithSameCode = productsWithSameCode.map(p => p._id.toString());
        const mongoIdsWithSameCode = idsWithSameCode.map(id => new mongoose.Types.ObjectId(id));

        const itemQtyInBill = items.filter(i => idsWithSameCode.includes(i.product.toString())).length;
        
        let requiredByReservation = 0;
        selectedResDocs.forEach(res => {
            if (idsWithSameCode.includes(res.product.toString())) {
                requiredByReservation += res.totalSets;
            }
        });

        const productInfo = productsWithSameCode.find(p => !p.isDeleted) || productsWithSameCode[0];
        if (!productInfo) continue;

        // FULFILLMENT CHECK: If this product has a selected reservation, it MUST be fully scanned
        if (requiredByReservation > 0 && itemQtyInBill < requiredByReservation) {
            return res.status(400).json({ 
                success: false, 
                message: `Incomplete Fulfillment: You selected reservations for ${requiredByReservation} sets of ${productInfo.productCode}, but only scanned ${itemQtyInBill} sets. Please scan all reserved items before saving.` 
            });
        }

        // 1. Calculate Physical Sets (Minimum across sizes)
        const physicalInInv = await INVENTORYITEM.countDocuments({ 
            product: { $in: idsWithSameCode }, 
            status: { $in: ["In Stock", "Reserved"] }, 
            isDeleted: { $ne: true } 
        });
        
        const sizeCounts = await Promise.all((productInfo.sizes || []).map(async (s) => {
            const sizeReturnAgg = await RETURN.aggregate([
                { $match: { product: { $in: mongoIdsWithSameCode }, size: new mongoose.Types.ObjectId(s._id), isDeleted: { $ne: true } } },
                { $group: { _id: null, total: { $sum: "$qty" } } },
            ]);
            const sReturn = sizeReturnAgg[0]?.total || 0;
            return physicalInInv + sReturn;
        }));
        const totalPhysicalSets = sizeCounts.length > 0 ? Math.min(...sizeCounts) : physicalInInv;

        // 2. Calculate All Reservations for this product code
        const totalReservedAgg = await ORDER_BOOKING.aggregate([
            { $match: { product: { $in: mongoIdsWithSameCode }, isDeleted: { $ne: true }, status: "Hold" } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const totalReservedAll = totalReservedAgg[0]?.total || 0;

        // 3. Formula: Availability for the current user
        let availableForMe;
        let quotaMessage = "";
        if (requiredByReservation > 0) {
            // Fulfilling specific reservation -> Limit is EXACTLY the reserved qty
            availableForMe = requiredByReservation;
            quotaMessage = `Your selected reservation limit for ${productInfo.productCode} is ${requiredByReservation} sets.`;
        } else {
            // General scan -> Limit is unreserved stock
            availableForMe = Math.max(0, totalPhysicalSets - totalReservedAll);
            quotaMessage = `Unreserved Availability: Only ${availableForMe} sets of ${productInfo.productCode} are currently free for non-reserved billing.`;
        }

        if (itemQtyInBill > availableForMe) {
            const extraMsg = requiredByReservation > 0 
                ? `You scanned ${itemQtyInBill} pieces but only ${requiredByReservation} are reserved. Please reduce quantity.` 
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
    if (lastSlip && lastSlip.billNumber) {
        // Handle both "SLIP-123" and "123" formats for backward compatibility
        const match = lastSlip.billNumber.match(/\d+/);
        if (match) {
            slipNumber = parseInt(match[match.length - 1]) + 1;
        }
    }
    const billNumber = slipNumber.toString();

    const billing = await BILLING.create({ 
        billNumber,
        customer, 
        items,
        totalAmount,
        subtotal,
        discountPercent,
        gstEnabled,
        gstPercent,
        fulfilledReservations: fulfilledReservationIds
    });

    // Update Inventory Items status and available sizes
    for (const item of items) {
        const bcode = String(item.barcode).trim();
        const invItem = await INVENTORYITEM.findOne({ barcode: { $regex: new RegExp(`^${bcode}$`, "i") } });
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
        const barcode = (req.params.barcode || "").trim();
        
        const item = await INVENTORYITEM.findOne({
            $or: [
                { barcode: { $regex: new RegExp(`^${barcode}$`, "i") } }, 
                { sequenceNumber: Number(barcode) || 0 }
            ],
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
        // Find all IDs for this code (to handle recreated products)
        const productsWithSameCode = await PRODUCT.find({ productCode: product.productCode });
        const idsWithSameCode = productsWithSameCode.map(p => p._id);
        
        // Check Reservation Quota
        const currentCustomerId = req.query.customerId;
        const alreadyScanned = parseInt(req.query.alreadyScanned) || 0;
        const selectedReservations = req.query.selectedReservations || [];
        const reservationIds = Array.isArray(selectedReservations) ? selectedReservations : [selectedReservations];

        const RETURN = require("../model/return");
        const inStockCount = await INVENTORYITEM.countDocuments({ product: { $in: idsWithSameCode }, status: { $in: ["In Stock", "Partial"] }, isDeleted: { $ne: true } });
        const returnAgg = await RETURN.aggregate([
            { $match: { product: { $in: idsWithSameCode }, isDeleted: { $ne: true } } },
            { $group: { _id: null, total: { $sum: "$qty" } } },
        ]);
        const returnQty = returnAgg[0]?.total || 0;
        const totalPhysicalOnPage = inStockCount + returnQty;
        
        // Find my reservations (Total for this product code)
        const isValideCustomerId = currentCustomerId && currentCustomerId.length === 24;
        const reservesByMeAgg = await ORDER_BOOKING.aggregate([
            { $match: { 
                product: { $in: idsWithSameCode }, 
                customer: isValideCustomerId ? new mongoose.Types.ObjectId(currentCustomerId) : null, 
                isDeleted: { $ne: true }, 
                status: "Hold" 
            } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const myTotalReservation = reservesByMeAgg[0]?.total || 0;

        // Calculate total for specifically SELECTED reservations for this product code
        const selectedMyReservesAgg = reservationIds.length > 0 ? await ORDER_BOOKING.aggregate([
            { $match: { 
                _id: { $in: reservationIds.filter(id => id && id.length === 24).map(id => new mongoose.Types.ObjectId(id)) },
                product: { $in: idsWithSameCode }, 
                isDeleted: { $ne: true }, 
                status: "Hold" 
            } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]) : [];
        const selectedReservationTotal = selectedMyReservesAgg[0]?.total || 0;

        // Find others' reservations
        const othersReservMatch = { 
            product: { $in: idsWithSameCode }, 
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
            availableQuota = totalPhysicalOnPage - reservedCountOthers; 
        }

        if (availableQuota <= alreadyScanned) {
            return res.status(400).json({ 
                success: false, 
                message: isReserved 
                    ? `Order Limit: You already scanned ${alreadyScanned} of the ${selectedReservationTotal} reserved sets for ${product.productCode}.`
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
      .populate({ path: "items.product", populate: { path: "sizes", select: "name" } })
      .populate({ path: "fulfilledReservations", populate: { path: "product", populate: { path: "sizes" } } });
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

    // --- QUOTA & FULFILLMENT VALIDATION ---
    const selectedResIds = (fulfilledReservationIds || []).filter(id => id && id.length === 24);
    
    // 1. Get all selected reservations
    const selectedResDocs = await ORDER_BOOKING.find({
        _id: { $in: selectedResIds.map(id => new mongoose.Types.ObjectId(id)) },
        status: { $in: ["Hold", "Closed"] }
    });

    const reservationRequirements = new Map(); // pId -> requiredSets
    selectedResDocs.forEach(res => {
        const pId = res.product.toString();
        reservationRequirements.set(pId, (reservationRequirements.get(pId) || 0) + res.totalSets);
    });

    const scannedProductIds = Array.from(new Set(items.map(i => i.product.toString())));
    const allRelevantProductIds = Array.from(new Set([...scannedProductIds, ...reservationRequirements.keys()]));
    const productsInvolved = await PRODUCT.find({ _id: { $in: allRelevantProductIds } });
    const uniqueCodes = Array.from(new Set(productsInvolved.map(p => p.productCode)));

    const RETURN = require("../model/return");
    for (const code of uniqueCodes) {
        const productsWithSameCode = await PRODUCT.find({ productCode: code });
        const idsWithSameCode = productsWithSameCode.map(p => p._id.toString());
        const mongoIdsWithSameCode = idsWithSameCode.map(id => new mongoose.Types.ObjectId(id));

        const itemQtyInBill = items.filter(i => idsWithSameCode.includes(i.product.toString())).length;
        const oldQtyInBill = oldBilling.items.filter(i => idsWithSameCode.includes(i.product.toString())).length;
        
        let requiredByReservation = 0;
        selectedResDocs.forEach(res => {
            if (idsWithSameCode.includes(res.product.toString())) {
                requiredByReservation += res.totalSets;
            }
        });

        const productInfo = productsWithSameCode.find(p => !p.isDeleted) || productsWithSameCode[0];
        if (!productInfo) continue;

        // FULFILLMENT CHECK: If this product has a selected reservation, it MUST be fully scanned
        if (requiredByReservation > 0 && itemQtyInBill < requiredByReservation) {
            return res.status(400).json({ 
                success: false, 
                message: `Incomplete Fulfillment: You selected reservations for ${requiredByReservation} sets of ${productInfo.productCode}, but only scanned ${itemQtyInBill} sets. Please scan all reserved items before updating.` 
            });
        }

        // 1. Calculate Physical Sets
        const physicalInInv = await INVENTORYITEM.countDocuments({ 
            product: { $in: idsWithSameCode }, 
            status: { $in: ["In Stock", "Reserved"] }, 
            isDeleted: { $ne: true } 
        });
        
        const sizeCounts = await Promise.all((productInfo.sizes || []).map(async (s) => {
            const sizeReturnAgg = await RETURN.aggregate([
                { $match: { product: { $in: mongoIdsWithSameCode }, size: new mongoose.Types.ObjectId(s._id), isDeleted: { $ne: true } } },
                { $group: { _id: null, total: { $sum: "$qty" } } },
            ]);
            return physicalInInv + (sizeReturnAgg[0]?.total || 0);
        }));
        const totalPhysicalSets = sizeCounts.length > 0 ? Math.min(...sizeCounts) : physicalInInv;

        // 2. Calculate All Reservations
        const totalReservedAgg = await ORDER_BOOKING.aggregate([
            { $match: { product: { $in: mongoIdsWithSameCode }, isDeleted: { $ne: true }, status: "Hold" } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const totalReservedAll = totalReservedAgg[0]?.total || 0;

        // 3. Formula: Availability
        let availableForMe;
        let quotaMessage = "";
        if (requiredByReservation > 0) {
            availableForMe = requiredByReservation + oldQtyInBill;
            quotaMessage = `Your reservation limit (+ existing) for ${productInfo.productCode} is ${availableForMe} sets.`;
        } else {
            availableForMe = Math.max(0, totalPhysicalSets - totalReservedAll) + oldQtyInBill;
            quotaMessage = `Unreserved Availability (+ existing): Only ${availableForMe} sets of ${productInfo.productCode} are free.`;
        }

        if (itemQtyInBill > availableForMe) {
            const extraMsg = requiredByReservation > 0 
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

    // Revert Old Reservations to 'Hold'
    if (oldBilling.fulfilledReservations?.length > 0) {
        await ORDER_BOOKING.updateMany(
            { _id: { $in: oldBilling.fulfilledReservations } },
            { status: "Hold" }
        );
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
        fulfilledReservations: fulfilledReservationIds,
        isDeleted: false 
      }, 
      { new: true }
    ).populate("customer");

    // Mark New Items as 'Sold' or 'Partial'
    for (const item of items) {
        const bcode = String(item.barcode).trim();
        const invItem = await INVENTORYITEM.findOne({ barcode: { $regex: new RegExp(`^${bcode}$`, "i") } });
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
        const bcode = String(item.barcode).trim();
        const invItem = await INVENTORYITEM.findOne({ barcode: { $regex: new RegExp(`^${bcode}$`, "i") } });
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

    // Revert Associated Reservations to 'Hold'
    if (billing.fulfilledReservations?.length > 0) {
        await ORDER_BOOKING.updateMany(
            { _id: { $in: billing.fulfilledReservations } },
            { status: "Hold" }
        );
    }

    res.status(200).json({ success: true, message: "Billing deleted and stock reverted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
