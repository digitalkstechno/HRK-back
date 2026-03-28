let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let ReturnSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    size: { type: Schema.Types.ObjectId, ref: "SizeMaster", required: true },
    qty: { type: Number, required: true, min: 1 },
    returnDate: { type: Date, required: true },
    barcode: { type: String },
    sequenceNumber: { type: Number },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Return", ReturnSchema);
