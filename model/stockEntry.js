const mongoose = require("mongoose");
const { Schema } = mongoose;

const stockEntrySchema = new Schema(
  {
    entryDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    supplierName: {
      type: String,
      required: true,
    },
    invoiceNumber: {
      type: String,
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
        type: Number, // Calculated: sets * sizes.length
        required: true
    },
    startSequence: {
      type: Number,
      required: true,
    },
    endSequence: {
      type: Number,
      required: true,
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("StockEntry", stockEntrySchema);
