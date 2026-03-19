const RETURN = require("../model/return");
const PRODUCT = require("../model/product");
const INVENTORYITEM = require("../model/inventoryItem");

// GET /return/products-by-filter?designNo=&sku=&category=
exports.getProductsByFilter = async (req, res) => {
  try {
    const { designNo, sku, category } = req.query;
    const query = { isDeleted: { $ne: true } };
    if (designNo) query.designNo = { $regex: designNo, $options: "i" };
    if (sku) query.sku = { $regex: sku, $options: "i" };
    if (category) query.category = category;

    const products = await PRODUCT.find(query)
      .populate("sizes")
      .populate("category")
      .limit(20);

    res.status(200).json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /return/create — sirf return records save karo, no barcode/inventory generation
exports.createReturn = async (req, res) => {
  try {
    const { product: productId, sizes, returnDate } = req.body;

    if (!productId || !sizes?.length || !returnDate) {
      return res.status(400).json({ success: false, message: "product, sizes, returnDate required" });
    }

    const product = await PRODUCT.findOne({ _id: productId, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const records = await RETURN.insertMany(
      sizes.map(({ size, qty }) => ({ product: productId, size, qty, returnDate }))
    );

    res.status(201).json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllReturns = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { isDeleted: { $ne: true } };
    const totalRecords = await RETURN.countDocuments(query);
    const data = await RETURN.find(query)
      .populate({ path: "product", populate: [{ path: "sizes" }, { path: "category" }] })
      .populate("size")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data,
      pagination: { totalRecords, currentPage: page, totalPages: Math.ceil(totalRecords / limit), limit },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchReturnById = async (req, res) => {
  try {
    const data = await RETURN.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate({ path: "product", populate: [{ path: "sizes" }, { path: "category" }] })
      .populate("size");
    if (!data) return res.status(404).json({ success: false, message: "Return not found" });
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteReturn = async (req, res) => {
  try {
    const data = await RETURN.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!data) return res.status(404).json({ success: false, message: "Return not found" });
    res.status(200).json({ success: true, message: "Return deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
