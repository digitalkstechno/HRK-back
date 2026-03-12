let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let PurchaseOrderSchema = new Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    supplier: {
      type: String,
      required: true,
    },
    items: {
      type: Array,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

let PURCHASEORDER = mongoose.model("PurchaseOrder", PurchaseOrderSchema);
module.exports = PURCHASEORDER;
