const mongoose = require("mongoose");
const { Schema } = mongoose;

const stockEntrySchema = new Schema(
  {
    entryDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    supplier: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    invoiceNumber: {
      type: String,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    expectedSets: {
      type: Number,
      default: 0,
    },
    totalSets: {
      type: Number,
      required: true,
    },
    pendingQuantity: {
      type: Number,
      default: 0,
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
    linkedPendingEntryId: {
      type: Schema.Types.ObjectId,
      ref: "StockEntry",
      default: null,
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StockEntry", stockEntrySchema);
