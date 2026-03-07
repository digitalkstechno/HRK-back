let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let CustomerSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

let CUSTOMER = mongoose.model("Customer", CustomerSchema);
module.exports = CUSTOMER;
