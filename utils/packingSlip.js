const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const PAGE_W = 595.28;
const PAGE_H = 841.89;

function groupItems(items) {
  try {
    const map = new Map();
    for (const item of (items || [])) {
      if (!item) continue;
      const prod = item.product || {};
      const key = String(prod._id || item.productName || Math.random().toString());
      
      const pieceCount = (prod.sizes && Array.isArray(prod.sizes)) ? prod.sizes.length : (item.qty === 1 ? 1 : 1);
      const totalPieces = (item.qty || 0);

      if (!map.has(key)) {
        map.set(key, {
          designNo: prod.designNo || item.productName || "Unknown",
          sku:      prod.sku      || "-",
          sizes:    Array.isArray(prod.sizes)
                      ? prod.sizes.map((s) => s.name || String(s)).join(", ")
                      : "-",
          qty:   0, 
          pieces: 0, 
          price: item.price || 0,
        });
      }
      const g = map.get(key);
      g.qty    += item.qty   || 0;
      g.pieces += totalPieces;
    }
    return Array.from(map.values());
  } catch (e) {
    console.error("Critical Error in groupItems:", e);
    return [];
  }
}

function drawTable(doc, startX, startY, cols, rows, HDR_H, ROW_H) {
  try {
    const totalW = (cols || []).reduce((s, c) => s + (c.w || 0), 0);
    const totalRows = (rows || []).length;
    const tableH = HDR_H + totalRows * ROW_H;

    doc.rect(startX, startY, totalW, HDR_H).fill("#000000");

    (rows || []).forEach((_, idx) => {
      const ry = startY + HDR_H + idx * ROW_H;
      doc.rect(startX, ry, totalW, ROW_H).fill(idx % 2 === 0 ? "#ffffff" : "#fbfbfb");
    });

    doc.fontSize(10).font("Helvetica-Bold").fillColor("#ffffff");
    (cols || []).forEach((col, i) => {
      const cx = startX + cols.slice(0, i).reduce((s, c) => s + (c.w || 0), 0);
      doc.text((col.h || "").toUpperCase(), cx + 2, startY + (HDR_H - 10) / 2 + 1, {
        width: (col.w || 10) - 4, align: "center", lineBreak: false,
      });
    });

    (rows || []).forEach((cells, idx) => {
      const ry = startY + HDR_H + idx * ROW_H;
      (cells || []).forEach((val, ci) => {
        if (ci >= cols.length) return;
        const cx = startX + cols.slice(0, ci).reduce((s, c) => s + (c.w || 0), 0);
        const isQty = ci === cols.length - 1;
        doc.fontSize(10)
           .font(isQty ? "Helvetica-Bold" : "Helvetica")
           .fillColor("#000000")
           .text(String(val || ""), cx + 2, ry + (ROW_H - 10) / 2 + 1, {
             width: (cols[ci].w || 10) - 4, align: cols[ci].align || "left", lineBreak: false,
           });
      });
    });

    doc.rect(startX, startY, totalW, tableH).lineWidth(1).stroke("#000000");
    doc.moveTo(startX, startY + HDR_H).lineTo(startX + totalW, startY + HDR_H).lineWidth(1).stroke("#000000");

    for (let i = 1; i < totalRows; i++) {
        const ry = startY + HDR_H + i * ROW_H;
        doc.moveTo(startX, ry).lineTo(startX + totalW, ry).lineWidth(0.3).stroke("#cccccc");
    }

    let cx = startX;
    (cols || []).slice(0, -1).forEach((col) => {
      cx += (col.w || 0);
      doc.moveTo(cx, startY).lineTo(cx, startY + tableH).lineWidth(0.5).stroke("#000000");
    });
  } catch (err) {
    console.error("Error drawing table:", err);
  }
}

function renderSlip(doc, billing, slipW, slipH) {
  const M = 20;
  const CONTENT_W = slipW - M * 2;
  const customer  = (billing && billing.customer) || {};
  const transport = (customer && customer.transport) || {};
  const grouped   = groupItems(billing && billing.items);

  const ROW_H = 22; 
  const HDR_H = 25; 

  const COLS = [
    { h: "Sr.",       w: 30,  align: "center" },
    { h: "Design No", w: 105, align: "center" },
    { h: "Color",     w: 105, align: "center" },
    { h: "Price",     w: 70,  align: "center" },
    { h: "Pcs",       w: Math.max(20, CONTENT_W - 310),  align: "center" }, 
  ];

  let y = M;

  doc.rect(5, 5, slipW - 10, slipH - 10).lineWidth(1.5).stroke("#000000");
  y += 10;

  const logoPath = path.join(__dirname, "..", "public", "hrk_logo.png");
  const LOGO_W = 60, LOGO_H = 30;

  try {
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, slipW / 2 - LOGO_W / 2, y, { width: LOGO_W, height: LOGO_H });
    } else {
      doc.fontSize(20).font("Helvetica-Bold").fillColor("#000")
         .text("HRK", 0, y + 2, { width: slipW, align: "center" });
    }
  } catch (err) {
    doc.fontSize(20).font("Helvetica-Bold")
       .text("HRK", 0, y + 2, { width: slipW, align: "center" });
  }

  doc.fontSize(8).font("Helvetica").fillColor("#444")
     .text("GST: 24ADEFS1747D1ZC", 0, y + LOGO_H + 4, { width: slipW, align: "center" });

  const phones = ["99136 39997", "90332 52577", "97125 34039"];
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#000");
  phones.forEach((p, i) => {
    doc.text(p, slipW - M - 90, y + i * 12, { width: 90, align: "right" });
  });

  // Small black tag in top-left corner (joined with border look)
  doc.rect(5, 5, 120, 20).fill("#000000");
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#ffffff")
     .text("PACKING SLIP", 5, 5 + 5, { width: 120, align: "center" });

  doc.fillColor("#000000"); // Reset for other text
  y = 35; // Start main content after the tag

  y += LOGO_H + 15;
  y += 8;

  const lW = CONTENT_W * 0.6;
  const rX = M + lW;
  const dt = (billing && billing.createdAt) ? new Date(billing.createdAt).toLocaleDateString("en-IN") : "-";

  const customerName = (customer && customer.name) || "Walk-in Customer";
  const infoRows = [
    { l: ["M/s. :  ",      customerName],         r: ["Bill No :  ",      (billing && billing.billNumber) || ""] },
    { l: ["GST :  ",      (customer && customer.gstNumber) || "-"],    r: ["Date :  ",         dt] },
    { l: ["Transport :  ", (transport && transport.name) || "-"],       r: ["Station :  ", (customer && customer.station) || "-"] },
  ];

  const lValW = lW - 60;
  const rValW = (CONTENT_W * 0.4) - 60;
  const PADDING = 6;
  doc.fontSize(10);

  infoRows.forEach(({ l, r }) => {
    const lh = doc.heightOfString(l[1] || "", { width: lValW });
    const rh = doc.heightOfString(r[1] || "", { width: rValW });
    const rowH = Math.max(lh, rh) + PADDING * 2;

    doc.rect(M, y, CONTENT_W, rowH).lineWidth(1).stroke("#000000");
    doc.moveTo(rX, y).lineTo(rX, y + rowH).lineWidth(1).stroke("#000000");

    const ry = y + PADDING;
    doc.font("Helvetica-Bold").text(l[0], M + 8, ry, { width: 55 });
    doc.font("Helvetica").text(l[1] || "", M + 8 + 55, ry, { width: lValW });

    doc.font("Helvetica-Bold").text(r[0], rX + 8, ry, { width: 55 });
    doc.font("Helvetica").text(r[1] || "", rX + 8 + 55, ry, { width: rValW });
    y += rowH;
  });

  y += 10;
  const tableRows = grouped.map((row, idx) => [
    String(idx + 1),
    row.designNo || "",
    row.sku || "",
    String(row.price || 0),
    String(row.pieces || 0),
  ]);

  drawTable(doc, M, y, COLS, tableRows, HDR_H, ROW_H);
  y += HDR_H + grouped.length * ROW_H;

  const TOTAL_H = 25;
  doc.rect(M, y, CONTENT_W, TOTAL_H).lineWidth(1).stroke("#000000");
  const totalPieces = grouped.reduce((s, r) => s + (r.pieces || 0), 0);
  doc.fontSize(12).font("Helvetica-Bold")
     .text(`TOTAL QTY : ${totalPieces}`, M, y + (TOTAL_H - 12) / 2, { width: CONTENT_W - 10, align: "right" });

  const FOOTER_H = 30;
  const footerY = Math.max(y + TOTAL_H + 10, slipH - M - FOOTER_H);
  
  // Footer box (table look)
  doc.rect(M, footerY, CONTENT_W, FOOTER_H).lineWidth(1).stroke("#000000");
  doc.moveTo(M + CONTENT_W / 2, footerY).lineTo(M + CONTENT_W / 2, footerY + FOOTER_H).lineWidth(1).stroke("#000000");

  doc.fontSize(10).font("Helvetica-Bold").text("PACKED BY : _______________", M + 10, footerY + 10);
  doc.text("CHECKED BY : _______________", M + CONTENT_W / 2 + 10, footerY + 10);
}

function generatePackingSlipPDF(billing, res) {
    const doc = new PDFDocument({ size: "A4", margin: 0, layout: "portrait" });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
        try {
            const data = Buffer.concat(chunks);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="packing-slip-${billing?.billNumber || 'err'}.pdf"`);
            res.setHeader("Content-Length", data.length);
            res.status(200).send(data);
        } catch (err) {
            console.error("Error sending PDF buffer:", err.message);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: "PDF Finalization failed" });
            }
        }
    });

    doc.on('error', err => {
        console.error("PDFKIT ERROR:", err.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "PDF Stream error" });
        }
    });

    try {
        const halfH = PAGE_H / 2;

        // Render only the first slip in the top half
        doc.save();
        doc.translate(PAGE_W, 0);
        doc.rotate(90);
        renderSlip(doc, billing, halfH, PAGE_W);
        doc.restore();

        // No more dashed line or second slip as per user request
        
        doc.end();
    } catch (err) {
        console.error("PDF GENERATION FATAL ERROR:", err.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: err.message });
        }
        // Destroy doc to stop events
        doc.destroy();
    }
}

module.exports = { generatePackingSlipPDF };
