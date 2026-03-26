const mongoose = require("mongoose");
const ORDER_BOOKING = require("../model/orderBooking");
const INVENTORY_ITEM = require("../model/inventoryItem");
const PRODUCT = require("../model/product");

exports.createOrderBooking = async (req, res) => {
  try {
    const { customer, product: productId, totalSets, items } = req.body;
    
    // Support for both single item and array of items
    const bookingsToCreate = items || (productId ? [{ product: productId, totalSets: totalSets }] : []);
    
    if (bookingsToCreate.length === 0) {
        return res.status(400).json({ success: false, message: "No products provided for order form." });
    }

    const createdBookings = [];

    for (const item of bookingsToCreate) {
        const productId = item.product;
        const totalSets = Number(item.totalSets);

        const product = await PRODUCT.findById(productId);
        if (!product) continue;

        // Calculate available sets for reservations
        const inStockItems = await INVENTORY_ITEM.countDocuments({ product: productId, status: "In Stock", isDeleted: { $ne: true } });
        const currentlyReservedSets = await ORDER_BOOKING.aggregate([
            { $match: { product: new mongoose.Types.ObjectId(productId), isDeleted: { $ne: true }, status: "Hold" } },
            { $group: { _id: null, total: { $sum: "$totalSets" } } }
        ]);
        const totalReserved = currentlyReservedSets[0]?.total || 0;
        
        // We can reserve up to (InStock - totalReserved) more sets
        const availableToReserve = inStockItems - totalReserved;
        if (availableToReserve < totalSets) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient Stock: Only ${availableToReserve} additional sets of ${product.productCode} are available for order.` 
            });
        }

        const booking = await ORDER_BOOKING.create({
            customer,
            product: productId,
            totalSets,
            totalItems: totalSets
        });
        createdBookings.push(booking);
    }

    res.status(201).json({ success: true, data: createdBookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllOrderBookings = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { isDeleted: { $ne: true } };
    if (req.query.customerId) query.customer = req.query.customerId;
    if (req.query.status) query.status = req.query.status;

    const totalRecords = await ORDER_BOOKING.countDocuments(query);
    const data = await ORDER_BOOKING.find(query)
      .populate("customer")
      .populate({ path: "product", populate: { path: "sizes" } })
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

exports.updateOrderBooking = async (req, res) => {
  try {
    const { totalSets } = req.body;
    const booking = await ORDER_BOOKING.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: "Order Booking not found" });

    // Validate new reservation quantity
    const productId = booking.product;
    const product = await PRODUCT.findById(productId);
    const inStockItems = await INVENTORY_ITEM.countDocuments({ product: productId, status: "In Stock", isDeleted: { $ne: true } });
    const currentlyReservedExcludingSelf = await ORDER_BOOKING.aggregate([
        { $match: { 
            _id: { $ne: booking._id }, 
            product: new mongoose.Types.ObjectId(productId), 
            isDeleted: { $ne: true }, 
            status: "Hold" 
        } },
        { $group: { _id: null, total: { $sum: "$totalSets" } } }
    ]);
    const totalReservedOthers = currentlyReservedExcludingSelf[0]?.total || 0;

    const availableToReserve = inStockItems - totalReservedOthers;
    if (availableToReserve < totalSets) {
        return res.status(400).json({ 
            success: false, 
            message: `Insufficient Stock: Only ${availableToReserve} sets of ${product.productCode} are available for order (considering other bookings).` 
        });
    }

    booking.totalSets = totalSets;
    booking.totalItems = totalSets;
    await booking.save();

    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOrderBooking = async (req, res) => {
  try {
    const booking = await ORDER_BOOKING.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: "Order Booking not found" });

    booking.isDeleted = true;
    booking.status = "Deleted";
    await booking.save();

    res.status(200).json({ success: true, message: "Order Booking removed" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
