const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "./.env") });

const Product = require("./model/product");
const SizeMaster = require("./model/sizemaster");

async function debugProduct() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/hrk");
        
        const p = await Product.findOne({ 
            $or: [
                { productCode: "2383-BLACK" },
                { designNo: "2383", sku: "BLACK" },
                { designNo: /2383/i, sku: /BLACK/i }
            ]
        }).populate("sizes");
        if (!p) {
            console.log("Product 2383-BLACK not found");
        } else {
            console.log("Product found:", {
                _id: p._id,
                productCode: p.productCode,
                sizes: p.sizes?.map(s => ({ id: s._id, name: s.name, isDeleted: s.isDeleted }))
            });
        }

        const allSizes = await SizeMaster.find({ isDeleted: { $ne: true } });
        console.log("All Active Sizes in System:", allSizes.map(s => s.name));

        await mongoose.disconnect();
    } catch (error) {
        console.error("Error:", error);
    }
}

debugProduct();
