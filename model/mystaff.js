let mongoose = require("mongoose");

let Schema = mongoose.Schema;

let MyStaffSchema = new Schema(
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

let MYSTAFF = mongoose.model("MyStaff", MyStaffSchema);
module.exports = MYSTAFF;
