const mongoose = require("mongoose");
const { Schema } = mongoose;

const SupplierSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    number: {
      type: String,
      required: true,
    },
    gstNumber: {
      type: String,
    },
    station: {
      type: String,
    },
    state: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Supplier", SupplierSchema);
