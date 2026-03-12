let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let TransportMasterSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

let TRANSPORTMASTER = mongoose.model("TransportMaster", TransportMasterSchema);
module.exports = TRANSPORTMASTER;
