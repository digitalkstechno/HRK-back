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
      required: false,
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
        sequenceNumber: {
          type: String,
        },
        qty: {
          type: Number,
          required: true,
        },
        originalQty: {
          type: Number,
          default: 0
        },
        price: {
          type: Number,
          required: true,
        },
        total: {
          type: Number,
          required: true,
        },
        soldSizes: [
          {
            type: Schema.Types.ObjectId,
            ref: "SizeMaster"
          }
        ],
        lostOrDefect: [
          {
            size: {
              type: Schema.Types.ObjectId,
              ref: "SizeMaster",
            },
            name: String,
            qty: {
              type: Number,
              default: 0
            }
          }
        ]
      },
    ],
    totalAmount: {
        type: Number,
        required: true,
        default: 0
    },
    subtotal: {
      type: Number,
      default: 0
    },
    gstEnabled: {
      type: Boolean,
      default: false
    },
    gstPercent: {
      type: Number,
      default: 0
    },
    discountPercent: {
      type: Number,
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
