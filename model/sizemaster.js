let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let SizeMasterSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

let SIZEMASTER = mongoose.model("SizeMaster", SizeMasterSchema);
module.exports = SIZEMASTER;
