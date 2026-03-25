const mongoose = require("mongoose");
const { Schema } = mongoose;

const orderBookingSchema = new Schema(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    totalSets: {
      type: Number,
      required: true,
    },
    totalItems: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["Hold", "Closed", "Deleted"],
      default: "Hold",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OrderBooking", orderBookingSchema);
