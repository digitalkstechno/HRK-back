let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let ReturnSchema = new Schema(
  {
    returnId: {
      type: String,
      required: true,
      unique: true,
    },
    scanBarcode: {
      type: String,
      required: true,
    },
    invoice: {
      type: String,
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
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
    refundMode: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

let RETURN = mongoose.model("Return", ReturnSchema);
module.exports = RETURN;
