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

// slipW=380, PAGE_W(landscape width)=841.89
// Right half starts at SLIP_W + gap
const SLIP_GAP = 10;

function drawSlipBlock(doc, billing, offsetX, slipW, slipH, tableRows, totalPieces, isFirst) {
  const M = 18;
  const CONTENT_W = slipW - M * 2;
  const ROW_H = 22;
  const HDR_H = 25;
  const COLS = [
    { h: "Sr.",       w: 30,  align: "center" },
    { h: "Design No", w: 105, align: "center" },
    { h: "Color",     w: 105, align: "center" },
    { h: "Price",     w: 70,  align: "center" },
    { h: "Pcs",       w: Math.max(20, CONTENT_W - 310), align: "center" },
  ];

  const customer  = (billing && billing.customer) || {};
  const transport = (customer && customer.transport) || {};

  // Border
  doc.rect(offsetX + 10, 10, slipW - 20, slipH - 20).lineWidth(1.5).stroke("#000000");
  let y = M + 2;

  // Logo
  const logoPath = path.join(__dirname, "..", "public", "HRK.jpg.jpeg");
  try {
    if (fs.existsSync(logoPath)) doc.image(logoPath, offsetX + M, y, { width: 70, height: 45 });
  } catch (e) {}

  // Header text
  doc.fontSize(22).font("Helvetica-Bold").fillColor("#000")
     .text("SRK FASHION HUB", offsetX, y + 2, { width: slipW, align: "center" });
  doc.fontSize(8).font("Helvetica").fillColor("#444")
     .text("GST: 24ADEFS1747D1ZC", offsetX, y + 25, { width: slipW, align: "center" });
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#000")
     .text("PACKING SLIP", offsetX, y + 40, { width: slipW, align: "center" });

  ["99136 39997", "90332 52577", "97125 34039"].forEach((p, i) => {
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#000")
       .text(p, offsetX + slipW - M - 90, y + i * 11, { width: 90, align: "right" });
  });

  y += 60;

  // Info rows
  const lW = CONTENT_W * 0.6;
  const rX = offsetX + M + lW;
  const dt = (billing && billing.createdAt) ? new Date(billing.createdAt).toLocaleDateString("en-IN") : "-";
  const customerName = (customer && customer.name) || "Walk-in Customer";
  const infoRows = [
    { l: ["M/s. :  ",      customerName],                            r: ["Bill No :  ",  (billing && billing.billNumber) || ""] },
    { l: ["GST :  ",       (customer && customer.gstNumber) || "-"], r: ["Date :  ",     dt] },
    { l: ["Transport :  ", (transport && transport.name) || "-"],    r: ["Station :  ",  (customer && customer.station) || "-"] },
    { l: ["Remarks :  ",   (billing && billing.remarks) || "-"],     r: ["", ""] },
  ];
  const lValW = lW - 60;
  const rValW = (CONTENT_W * 0.4) - 60;
  const PADDING = 6;
  doc.fontSize(10);
  infoRows.forEach(({ l, r }) => {
    const rowH = Math.max(doc.heightOfString(l[1] || "", { width: lValW }), doc.heightOfString(r[1] || "", { width: rValW })) + PADDING * 2;
    doc.rect(offsetX + M, y, CONTENT_W, rowH).lineWidth(1).stroke("#000000");
    if (l[0] !== "Remarks :  ") doc.moveTo(rX, y).lineTo(rX, y + rowH).lineWidth(1).stroke("#000000");
    const ry = y + PADDING;
    doc.font("Helvetica-Bold").text(l[0], offsetX + M + 8, ry, { width: 55 });
    doc.font("Helvetica").text(l[1] || "", offsetX + M + 63, ry, { width: l[0] === "Remarks :  " ? CONTENT_W - 65 : lValW });
    if (r[0]) {
      doc.font("Helvetica-Bold").text(r[0], rX + 8, ry, { width: 55 });
      doc.font("Helvetica").text(r[1] || "", rX + 63, ry, { width: rValW });
    }
    y += rowH;
  });

  y += 10;

  // Table
  const shiftedCols = COLS.map(c => ({ ...c }));
  drawTable(doc, offsetX + M, y, shiftedCols, tableRows, HDR_H, ROW_H);
  y += HDR_H + tableRows.length * ROW_H;

  // Total
  const TOTAL_H = 25;
  doc.rect(offsetX + M, y, CONTENT_W, TOTAL_H).lineWidth(1).stroke("#000000");
  doc.fontSize(12).font("Helvetica-Bold")
     .text(`TOTAL QTY : ${totalPieces}`, offsetX + M, y + (TOTAL_H - 12) / 2, { width: CONTENT_W - 10, align: "right" });

  // Footer
  const FOOTER_H = 30;
  const footerY = Math.max(y + TOTAL_H + 10, slipH - M - FOOTER_H);
  doc.rect(offsetX + M, footerY, CONTENT_W, FOOTER_H).lineWidth(1).stroke("#000000");
  doc.moveTo(offsetX + M + CONTENT_W / 2, footerY).lineTo(offsetX + M + CONTENT_W / 2, footerY + FOOTER_H).lineWidth(1).stroke("#000000");
  doc.fontSize(10).font("Helvetica-Bold")
     .text(`PACKED BY : ${(billing.packedBy && billing.packedBy.name) || "_______________"}`, offsetX + M + 10, footerY + 10);
  doc.text(`CHECKED BY : ${(billing.checkedBy && billing.checkedBy.name) || "_______________"}`, offsetX + M + CONTENT_W / 2 + 10, footerY + 10);
}

function renderSlip(doc, billing, slipW, slipH) {
  const M = 18;
  const ROW_H = 22;
  const HDR_H = 25;
  const FOOTER_H = 30;
  const TOTAL_H = 25;

  const grouped = groupItems(billing && billing.items);
  const totalPieces = grouped.reduce((s, r) => s + (r.pieces || 0), 0);

  const tableRows = grouped.map((row, idx) => [
    String(idx + 1),
    row.designNo || "",
    row.sku || "",
    String(row.price || 0),
    String(row.pieces || 0),
  ]);

  // Calculate how many rows fit in one slip
  // Approximate header height: logo+title+phones=60, infoRows~4*22=88, gap=10 => ~158
  const approxHeaderH = 158;
  const availableForTable = slipH - M - approxHeaderH - TOTAL_H - FOOTER_H - 20;
  const maxRows = Math.max(1, Math.floor((availableForTable - HDR_H) / ROW_H));

  const firstChunk  = tableRows.slice(0, maxRows);
  const secondChunk = tableRows.slice(maxRows);

  // Draw first slip on left half
  drawSlipBlock(doc, billing, 0, slipW, slipH, firstChunk, totalPieces, true);

  // If overflow, draw second slip on right half of same page
  if (secondChunk.length > 0) {
    const rightOffsetX = slipW + SLIP_GAP;
    drawSlipBlock(doc, billing, rightOffsetX, slipW, slipH, secondChunk, totalPieces, false);
  }
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
        // A4 landscape width = PAGE_H = 841.89
        // Two slips side by side with gap: SLIP_W*2 + SLIP_GAP <= PAGE_H
        const SLIP_W = Math.floor((PAGE_H - SLIP_GAP) / 2); // ~415 each
        doc.save();
        doc.translate(PAGE_W, 0);
        doc.rotate(90);
        renderSlip(doc, billing, SLIP_W, PAGE_W);
        doc.restore();
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
