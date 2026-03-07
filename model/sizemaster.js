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
  },
  { timestamps: true }
);

let SIZEMASTER = mongoose.model("SizeMaster", SizeMasterSchema);
module.exports = SIZEMASTER;
