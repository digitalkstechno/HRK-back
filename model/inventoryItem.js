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
      required: false,
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
      enum: ["In Stock", "Sold", "Reserved", "Partial"],
      default: "In Stock",
    },
    availableSizes: [
      {
        type: Schema.Types.ObjectId,
        ref: "SizeMaster",
      },
    ],
    lostSizes: [
      {
        type: Schema.Types.ObjectId,
        ref: "SizeMaster",
      },
    ],
    initialSizes: [
      {
        type: Schema.Types.ObjectId,
        ref: "SizeMaster",
      },
    ],
    soldDate: {
      type: Date,
    },
    reservedFor: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
    },
    billId: {
      type: Schema.Types.ObjectId,
      ref: "Bill",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isReturn: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index for faster lookups when searching by status
inventoryItemSchema.index({ product: 1, status: 1 });

module.exports = mongoose.model("InventoryItem", inventoryItemSchema);
