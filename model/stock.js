let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let StockSchema = new Schema(
  {
    entryDate: {
      type: Date,
      required: true,
    },
    supplier: {
      type: String,
      required: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
    },
    items: {
      type: Array,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

let STOCK = mongoose.model("Stock", StockSchema);
module.exports = STOCK;
