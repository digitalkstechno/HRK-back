const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const PAGE_W = 595;
const PAGE_H = 842; // A4 Portrait
const M = 40; // Balanced margins for A4
const CONTENT_W = PAGE_W - M * 2;

const COLS = [
  { h: "Sr.",       w: 35,  align: "center" },
  { h: "Design No", w: 140, align: "center" },
  { h: "Color",     w: 150, align: "center" },
  { h: "Price",     w: 90,  align: "center" },
  { h: "Pieces",    w: 100, align: "center" },
];
const TABLE_W = CONTENT_W;

function groupItems(items) {
  const map = new Map();
  for (const item of items) {
    const prod = item.product || {};
    const key = String(prod._id || item.productName);
    const pieceCount = (prod.sizes || []).length || 1; // Pieces per set
    const totalPieces = (item.qty || 0) * pieceCount;

    if (!map.has(key)) {
      map.set(key, {
        designNo: prod.designNo || item.productName || "",
        sku:      prod.sku      || "",
        sizes:    Array.isArray(prod.sizes)
                    ? prod.sizes.map((s) => s.name || String(s)).join(", ")
                    : "",
        qty:   0, // Sets
        pieces: 0, // Total Pieces
        price: item.price || 0,
        total: 0,
      });
    }
    const g = map.get(key);
    g.qty    += item.qty   || 0;
    g.pieces += totalPieces;
    g.total  += item.total || 0;
  }
  return Array.from(map.values());
}

function drawTable(doc, startX, startY, cols, rows, HDR_H, ROW_H) {
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const totalRows = rows.length;
  const tableH = HDR_H + totalRows * ROW_H;

  doc.rect(startX, startY, totalW, HDR_H).fill("#000000");

  rows.forEach((_, idx) => {
    const ry = startY + HDR_H + idx * ROW_H;
    doc.rect(startX, ry, totalW, ROW_H).fill(idx % 2 === 0 ? "#ffffff" : "#fbfbfb");
  });

  doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#ffffff");
  cols.forEach((col, i) => {
    const cx = startX + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
    doc.text(col.h.toUpperCase(), cx + 5, startY + (HDR_H - 10.5) / 2 + 1, {
      width: col.w - 10, align: "center", lineBreak: false,
    });
  });

  rows.forEach((cells, idx) => {
    const ry = startY + HDR_H + idx * ROW_H;
    cells.forEach((val, ci) => {
      const cx = startX + cols.slice(0, ci).reduce((s, c) => s + c.w, 0);
      const isQty = ci === cols.length - 1;
      doc.fontSize(10.5)
         .font(isQty ? "Helvetica-Bold" : "Helvetica")
         .fillColor("#000000")
         .text(String(val), cx + 5, ry + (ROW_H - 10.5) / 2 + 1, {
           width: cols[ci].w - 10, align: cols[ci].align, lineBreak: false,
         });
    });
  });

  doc.rect(startX, startY, totalW, tableH).lineWidth(1).stroke("#000000");
  doc.moveTo(startX, startY + HDR_H).lineTo(startX + totalW, startY + HDR_H).lineWidth(1.2).stroke("#000000");

  for (let i = 1; i < totalRows; i++) {
    const ry = startY + HDR_H + i * ROW_H;
    doc.moveTo(startX, ry).lineTo(startX + totalW, ry).lineWidth(0.4).stroke("#cccccc");
  }

  let cx = startX;
  cols.slice(0, -1).forEach((col) => {
    cx += col.w;
    doc.moveTo(cx, startY).lineTo(cx, startY + tableH).lineWidth(0.8).stroke("#000000");
  });
}

function generatePackingSlipPDF(billing, res) {
  const customer  = billing.customer  || {};
  const transport = customer.transport || {};
  const grouped   = groupItems(billing.items || []);

  const ROW_H = 26; 
  const HDR_H = 28; 

  const doc = new PDFDocument({ size: "A4", margin: 0 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="packing-slip-${billing.billNumber}.pdf"`);
  doc.pipe(res);

  let y = M;

  doc.rect(M, y, CONTENT_W, 3).fill("#000000");
  y += 15;

  const logoPath = path.join(__dirname, "../public/hrk_logo.png");
  const LOGO_W = 100, LOGO_H = 50;

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, PAGE_W / 2 - LOGO_W / 2, y, { width: LOGO_W, height: LOGO_H });
  } else {
    doc.fontSize(28).font("Helvetica-Bold").fillColor("#000")
       .text("HRK", 0, y + 5, { width: PAGE_W, align: "center", lineBreak: false });
  }

  doc.fontSize(10).font("Helvetica").fillColor("#444")
     .text("GST: 24ADEFS1747D1ZC", 0, y + LOGO_H + 8, { width: PAGE_W, align: "center", lineBreak: false });

  const phones = ["99136 39997", "90332 52577", "97125 34039"];
  doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#000");
  phones.forEach((p, i) => {
    doc.text(p, PAGE_W - M - 140, y + i * 15, { width: 140, align: "right", lineBreak: false });
  });

  doc.fontSize(22).font("Helvetica-Bold").fillColor("#000")
     .text("PACKING SLIP", M, y + 15, { width: 250, lineBreak: false });

  y += LOGO_H + 30;

  doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(1.5).stroke("#000000");
  y += 12;

  const lW = CONTENT_W * 0.65;
  const rX = M + lW;
  const rW = CONTENT_W * 0.35;
  const dt = new Date(billing.createdAt).toLocaleDateString("en-IN");

  const customerName = billing.customer?.name || "Walk-in Customer";
  const infoRows = [
    { l: ["M/s. :  ",      customerName],         r: ["Bill No :  ",      billing.billNumber || ""] },
    { l: ["Party GST :  ", customer.gstNumber || "-"],   r: ["Date :  ",         dt] },
    { l: ["Transport :  ", transport.name || "-"],       r: ["Station :  ", customer.station || "-"] },
  ];

  const lValX = M + 12 + 75; 
  const lValW = lW - 95;
  const rValX = rX + 12 + 75;
  const rValW = rW - 95;

  const PADDING = 8;
  doc.fontSize(11);

  infoRows.forEach(({ l, r }) => {
    // Calculate heights for wrapped values
    doc.font("Helvetica");
    const lh = doc.heightOfString(l[1], { width: lValW });
    const rh = doc.heightOfString(r[1], { width: rValW });
    const rowH = Math.max(lh, rh) + PADDING * 2;

    // Draw individual row box
    doc.rect(M, y, CONTENT_W, rowH).lineWidth(1.2).stroke("#000000");
    // Vertical divider
    doc.moveTo(rX, y).lineTo(rX, y + rowH).lineWidth(1.2).stroke("#000000");

    const ry = y + PADDING;

    // --- LEFT COLUMN ---
    doc.font("Helvetica-Bold").fillColor("#000")
       .text(l[0], M + 12, ry, { lineBreak: false, width: 85 });
    
    doc.font("Helvetica").fillColor("#000")
       .text(l[1], lValX, ry, { width: lValW, lineBreak: true });

    // --- RIGHT COLUMN ---
    doc.font("Helvetica-Bold").fillColor("#000")
       .text(r[0], rX + 12, ry, { lineBreak: false, width: 95 });

    doc.font("Helvetica").fillColor("#000")
       .text(r[1], rValX, ry, { width: rValW, lineBreak: true });

    y += rowH;
  });

  y += 18;

  const tableRows = grouped.map((row, idx) => [
    String(idx + 1),
    row.designNo,
    row.sku,
    String(row.price),
    String(row.pieces), // Total Pieces for this design
  ]);

  drawTable(doc, M, y, COLS, tableRows, HDR_H, ROW_H);
  y += HDR_H + grouped.length * ROW_H;

  const TOTAL_H = 26;
  doc.rect(M, y, TABLE_W, TOTAL_H).lineWidth(1.2).stroke("#000000");
  const totalPieces = grouped.reduce((s, r) => s + (r.pieces || 0), 0);
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#000")
     .text(`TOTAL PIECES : ${totalPieces}`, M, y + (TOTAL_H - 12) / 2, {
       width: TABLE_W - 18, align: "right", lineBreak: false,
     });

  // --- ANCHOR FOOTER TO BOTTOM OF A4 PAGE ---
  const FOOTER_H = 80;
  const footerY = PAGE_H - M - FOOTER_H;

  doc.rect(M, footerY, CONTENT_W, FOOTER_H).lineWidth(1.2).stroke("#000000");
  
  const sigDivX = M + CONTENT_W / 2;
  doc.moveTo(sigDivX, footerY).lineTo(sigDivX, footerY + FOOTER_H).lineWidth(1).stroke("#000000");

  doc.fontSize(10).font("Helvetica").fillColor("#000")
     .text("1. Received the above goods in good condition.", M + 12, footerY + 12, { lineBreak: false })
     .text("2. Subject to Surat Jurisdiction.", M + 12, footerY + 28, { lineBreak: false });

  doc.moveTo(M, footerY + 48).lineTo(M + CONTENT_W, footerY + 48).lineWidth(0.6).stroke("#cccccc");

  doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#000")
     .text("PACKED BY : _____________________", M + 12, footerY + 58, { lineBreak: false });
  doc.text("CHECKED BY : ____________________", sigDivX + 12, footerY + 58, { lineBreak: false });

  doc.rect(M, PAGE_H - M - 3, CONTENT_W, 3).fill("#000000");

  doc.end();
}

module.exports = { generatePackingSlipPDF };
