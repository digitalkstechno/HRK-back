let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let ProductSchema = new Schema(
  {
    designNo: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    productCode: {
      type: String,
      required: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "CategoryMaster",
      required: true,
    },
    purchasePrice: {
      type: Number,
    },
    salePrice: {
      type: Number,
      required: true,
    },
    sizes: [
      {
        type: Schema.Types.ObjectId,
        ref: "SizeMaster",
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

let PRODUCT = mongoose.model("Product", ProductSchema);
module.exports = PRODUCT;
