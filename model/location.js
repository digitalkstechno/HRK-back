const mongoose = require("mongoose");

const LocationSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    }
  },
  { 
    timestamps: true 
  }
);

// Ensure the same city is not added twice for the same state
LocationSchema.index({ state: 1, city: 1 }, { unique: true });

const LOCATION = mongoose.model("Location", LocationSchema);
module.exports = LOCATION;
