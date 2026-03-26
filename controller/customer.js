let CUSTOMER = require("../model/customer");

exports.createCustomer = async (req, res) => {
  try {
    const { name, number, gstNumber, station, state, transport } = req.body;
    const customer = await CUSTOMER.create({ name, number, gstNumber, station, state, transport });
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchAllCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = {
      isDeleted: { $ne: true },
      $or: [
        { name: { $regex: search, $options: "i" } },
        { number: { $regex: search, $options: "i" } },
        { gstNumber: { $regex: search, $options: "i" } },
        { station: { $regex: search, $options: "i" } },
        { state: { $regex: search, $options: "i" } },
      ],
    };

    const [totalRecords, data] = await Promise.all([
      CUSTOMER.countDocuments(query),
      CUSTOMER.find(query)
        .populate("transport")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data,
      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.fetchCustomerById = async (req, res) => {
  try {
    const customer = await CUSTOMER.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).populate("transport");
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { name, number, gstNumber, station, state, transport } = req.body;
    const customer = await CUSTOMER.findByIdAndUpdate(
      req.params.id,
      { name, number, gstNumber, station, state, transport },
      { new: true }
    ).populate("transport");
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await CUSTOMER.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    res.status(200).json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const XLSX = require("xlsx");
const fs = require("fs");

exports.bulkUploadCustomers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please upload an excel file" });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // defval: "" ensures we get empty strings instead of undefined for missing cells
    const excelData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    if (excelData.length === 0) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: "Excel file is empty" });
    }

    const customersToInsert = [];
    const skippedRows = [];

    excelData.forEach((row, index) => {
      // Flexible column mapping
      const name = (
        row.Name || 
        row.name || 
        row.Customer || 
        row.customer || 
        row["Customer Name"] || 
        row["customer name"] || 
        ""
      ).toString().trim();

      const number = (
        row.Number || 
        row.number || 
        row.Phone || 
        row.phone || 
        row.Mobile || 
        row.mobile || 
        row.Contact || 
        row.contact || 
        ""
      ).toString().trim();

      // Check for required fields - Only name is strictly required now
      if (!name) {
        // Only skip if it's not a completely empty row (sometimes Excel has ghost rows)
        const hasAnyData = Object.values(row).some(val => val !== "");
        if (hasAnyData) {
          skippedRows.push({
            rowNumber: index + 2, // 1 for header + 1 for 0-indexing
            data: row,
            reason: "Name is missing (Required)"
          });
        }
        return;
      }

      customersToInsert.push({
        name,
        number, // If empty, it's fine according to new schema
        gstNumber: String(row["GST Number"] || row.gstNumber || row.gst || row.GST || row["GSTIN"] || "").trim(),
        station: row.Station || row.station || row.City || row.city || row.Area || row.area || "",
        state: row.State || row.state || "",
        isDeleted: false
      });
    });

    if (customersToInsert.length === 0) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        success: false, 
        message: "No valid customer records found in the excel file",
        totalInExcel: excelData.length,
        skippedCount: skippedRows.length,
        skippedRows: skippedRows.slice(0, 20)
      });
    }

    // Use ordered: false to continue even if some individual inserts fail (though unlikely here)
    const result = await CUSTOMER.insertMany(customersToInsert, { ordered: false });

    // Remove temp file
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res.status(201).json({ 
      success: true, 
      message: `Successfully uploaded ${result.length} customers.`,
      summary: {
        totalRowsInExcel: excelData.length,
        successfullyAdded: result.length,
        skipped: skippedRows.length
      },
      skippedRows: skippedRows.length > 0 ? skippedRows.slice(0, 50) : [] // Return first 50 skipped for debugging
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.downloadSampleCustomerExcel = async (req, res) => {
  try {
    const sampleData = [
      {
        "Name": "John Doe",
        "Number": "9876543210",
        "GST Number": "24ABCDE1234F1Z5",
        "Station": "Central Park",
        "State": "Delhi"
      },
      {
        "Name": "Jane Smith",
        "Number": "9123456780",
        "GST Number": "",
        "Station": "Marine Drive",
        "State": "Maharashtra"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sample Customers");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", 'attachment; filename="customer_upload_template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.fetchCustomerDropdown = async (req, res) => {
  try {
    const search = req.query.search || "";
    const query = {
      isDeleted: { $ne: true },
      $or: [
        { name: { $regex: search, $options: "i" } },
        { number: { $regex: search, $options: "i" } },
      ],
    };

    const data = await CUSTOMER.find(query)
      .select("name number")
      .sort({ name: 1 })
      .lean();

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
