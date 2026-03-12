const mongoose = require("mongoose");
const { Schema } = mongoose;

const barcodeCounterSchema = new Schema({
  name: { type: String, required: true, unique: true },
  count: { type: Number, default: 10000001 } // Starts from an 8-digit number
});

module.exports = mongoose.model("BarcodeCounter", barcodeCounterSchema);
