let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
    },
    category: {
      type: String,
      required: true,
    },
    purchasePrice: {
      type: Number,
      required: true,
    },
    salePrice: {
      type: Number,
      required: true,
    },
    barcode: {
      type: String,
      required: true,
    },
    sizes: [
      {
        size: {
          type: Schema.Types.ObjectId,
          ref: "SizeMaster",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          default: 0,
        },
      },
    ],
  },
  { timestamps: true }
);

let PRODUCT = mongoose.model("Product", ProductSchema);
module.exports = PRODUCT;
