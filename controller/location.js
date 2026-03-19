const { INDIAN_DATA } = require("../utils/indiaData");
const Location = require("../model/location");

// Seed database on the first request if it's empty
const seedLocations = async () => {
    try {
        const count = await Location.countDocuments();
        if (count === 0) {
            console.log("Seeding locations from indiaData.js...");
            const seedData = [];
            for (const state in INDIAN_DATA) {
                for (const city of INDIAN_DATA[state]) {
                    seedData.push({ state, city });
                }
            }
            await Location.insertMany(seedData, { ordered: false });
            console.log("Locations seeded successfully!");
        }
    } catch (err) {
        console.error("Seeding error:", err.message);
    }
}

// Invoke seed check once on controller load
seedLocations();

exports.getStates = async (req, res) => {
    try {
        const states = await Location.distinct("state");
        res.status(200).json({ status: true, data: states.sort() });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
};

exports.getCitiesByState = async (req, res) => {
    try {
        const { state } = req.query;
        if (!state) return res.status(400).json({ status: false, message: "State is required" });
        
        const cities = await Location.find({ state }).select("city -_id");
        res.status(200).json({ status: true, data: cities.map(c => c.city).sort() });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
};

exports.addLocation = async (req, res) => {
    try {
        const { state, city } = req.body;
        if (!state || !city) {
            return res.status(400).json({ status: false, message: "Both state and city are required" });
        }
        
        // Try creating, let Mongoose index handle uniqueness
        await Location.findOneAndUpdate(
            { state, city },
            { state, city },
            { upsert: true, new: true }
        );
        
        res.status(201).json({ status: true, message: "Location saved successfully" });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
};
