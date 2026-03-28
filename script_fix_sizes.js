const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "./.env") });

const SizeMaster = require("./model/sizemaster");
const Product = require("./model/product");
const InventoryItem = require("./model/inventoryItem");

async function fixDuplicateSizes() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/hrk");
        console.log("Connected to MongoDB");

        const allSizes = await SizeMaster.find({});
        const nameMap = {}; // name -> activeSizeId

        // Identify active sizes
        allSizes.forEach(s => {
            if (!s.isDeleted) {
                nameMap[s.name] = s._id;
            }
        });

        console.log("Active Size Map:", nameMap);

        const idRemap = {}; // deletedId -> activeId
        allSizes.forEach(s => {
            if (s.isDeleted && nameMap[s.name]) {
                idRemap[s._id.toString()] = nameMap[s.name].toString();
            }
        });

        const deletedIds = Object.keys(idRemap);
        console.log(`Found ${deletedIds.length} deleted sizes to remap.`);

        if (deletedIds.length === 0) {
            console.log("No remapping needed.");
            return;
        }

        // 1. Fix Products
        console.log("Fixing Products...");
        const products = await Product.find({ sizes: { $in: deletedIds } });
        for (const p of products) {
            p.sizes = p.sizes.map(sid => {
                const sidStr = sid.toString();
                return idRemap[sidStr] || sid;
            });
            // Remove duplicates within the same product if any
            p.sizes = [...new Set(p.sizes.map(s => s.toString()))];
            await p.save();
        }
        console.log(`Updated ${products.length} products.`);

        // 2. Fix Inventory Items
        console.log("Fixing Inventory Items...");
        // availableSizes
        const items1 = await InventoryItem.find({ availableSizes: { $in: deletedIds } });
        for (const item of items1) {
            item.availableSizes = item.availableSizes.map(sid => idRemap[sid.toString()] || sid);
            item.initialSizes = item.initialSizes.map(sid => idRemap[sid.toString()] || sid);
            await item.save();
        }
        console.log(`Updated ${items1.length} inventory items.`);

        await mongoose.disconnect();
        console.log("Done.");
    } catch (error) {
        console.error("Error:", error);
    }
}

fixDuplicateSizes();
