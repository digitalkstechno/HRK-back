let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let BillingSchema = new Schema(
  {
    billNumber: {
      type: String,
      unique: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    items: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        productName: {
          type: String,
          required: true,
        },
        barcode: {
          type: String,
          required: true,
        },
        qty: {
          type: Number,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        total: {
          type: Number,
          required: true,
        },
      },
    ],
    totalAmount: {
        type: Number,
        required: true,
        default: 0
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

let BILLING = mongoose.model("Billing", BillingSchema);
module.exports = BILLING;
