require("dotenv").config();
const mongoose = require("mongoose");
const crypto = require("crypto");
const STAFF = require("./model/staff");

const seedStaff = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected ✅");

    await STAFF.deleteMany({});
    console.log("Existing staff deleted");

    const hashedPassword = crypto.createHash("sha256").update("admin123").digest("hex");

    const staffData = [
      {
        fullName: "Admin User",
        email: "admin@example.com",
        password: hashedPassword,
        status: "active",
      },
      {
        fullName: "Test Staff",
        email: "staff@example.com",
        password: hashedPassword,
        status: "active",
      },
    ];

    await STAFF.insertMany(staffData);
    console.log("Staff seeded successfully ✅");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed ❌", error.message);
    process.exit(1);
  }
};

seedStaff();
