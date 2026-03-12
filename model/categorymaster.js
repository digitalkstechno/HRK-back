let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let CategoryMasterSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

let CATEGORYMASTER = mongoose.model("CategoryMaster", CategoryMasterSchema);
module.exports = CATEGORYMASTER;
