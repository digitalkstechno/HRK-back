let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let CustomerSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    number: {
      type: String,
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
    transport: {
      type: Schema.Types.ObjectId,
      ref: "TransportMaster",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

let CUSTOMER = mongoose.model("Customer", CustomerSchema);
module.exports = CUSTOMER;
