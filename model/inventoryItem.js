const mongoose = require("mongoose");
const { Schema } = mongoose;

const inventoryItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    stockEntry: {
      type: Schema.Types.ObjectId,
      ref: "StockEntry",
      required: true,
    },
    barcode: {
      type: String,
      required: true,
      unique: true,
    },
    sequenceNumber: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["In Stock", "Sold"],
      default: "In Stock",
    },
    soldDate: {
      type: Date,
    },
    billId: {
      type: Schema.Types.ObjectId,
      ref: "Bill",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index for faster lookups when searching by barcode or status
inventoryItemSchema.index({ barcode: 1 });
inventoryItemSchema.index({ product: 1, status: 1 });

module.exports = mongoose.model("InventoryItem", inventoryItemSchema);
