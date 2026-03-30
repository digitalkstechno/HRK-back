const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

// Logical Portrait Dimensions: A4 (595.28 x 841.89)
const PAGE_W = 595.28;
const PAGE_H = 841.89; 
const M = 30; 
const CONTENT_W = PAGE_W - M * 2;

const COLS = [
  { h: "Sr.",       w: 45,  align: "center" },
  { h: "Design No", w: 148, align: "center" },
  { h: "Color",     w: 148, align: "center" },
  { h: "Price",     w: 97,  align: "center" },
  { h: "Pieces",    w: 97,  align: "center" },
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

  doc.fontSize(12).font("Helvetica-Bold").fillColor("#ffffff");
  cols.forEach((col, i) => {
    const cx = startX + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
    doc.text(col.h.toUpperCase(), cx + 3, startY + (HDR_H - 12) / 2 + 1, {
      width: col.w - 6, align: "center", lineBreak: false,
    });
  });

  rows.forEach((cells, idx) => {
    const ry = startY + HDR_H + idx * ROW_H;
    cells.forEach((val, ci) => {
      const cx = startX + cols.slice(0, ci).reduce((s, c) => s + c.w, 0);
      const isQty = ci === cols.length - 1;
      doc.fontSize(12)
         .font(isQty ? "Helvetica-Bold" : "Helvetica")
         .fillColor("#000000")
         .text(String(val), cx + 3, ry + (ROW_H - 12) / 2 + 1, {
           width: cols[ci].w - 6, align: cols[ci].align, lineBreak: false,
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
  cols.slice(0, -1).forEach((col) => {
    cx += col.w;
    doc.moveTo(cx, startY).lineTo(cx, startY + tableH).lineWidth(0.5).stroke("#000000");
  });
}

function generatePackingSlipPDF(billing, res) {
  const customer  = billing.customer  || {};
  const transport = customer.transport || {};
  const grouped   = groupItems(billing.items || []);

  const ROW_H = 26; 
  const HDR_H = 30; 

  // Physical page: A4 (595.28 x 841.89)
  const doc = new PDFDocument({ size: "A4", margin: 0, layout: "portrait" }); 
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="packing-slip-${billing.billNumber}.pdf"`);
  doc.pipe(res);

  let y = M;

  doc.rect(M, y, CONTENT_W, 2.5).fill("#000000");
  y += 12;

  const logoPath = path.join(__dirname, "../public/hrk_logo.png");
  const LOGO_W = 75, LOGO_H = 38;

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, PAGE_W / 2 - LOGO_W / 2, y, { width: LOGO_W, height: LOGO_H });
  } else {
    doc.fontSize(24).font("Helvetica-Bold").fillColor("#000")
       .text("HRK", 0, y + 5, { width: PAGE_W, align: "center", lineBreak: false });
  }

  doc.fontSize(10).font("Helvetica").fillColor("#444")
     .text("GST: 24ADEFS1747D1ZC", 0, y + LOGO_H + 6, { width: PAGE_W, align: "center", lineBreak: false });

  const phones = ["99136 39997", "90332 52577", "97125 34039"];
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#000");
  phones.forEach((p, i) => {
    doc.text(p, PAGE_W - M - 110, y + i * 15, { width: 110, align: "right", lineBreak: false });
  });

  doc.fontSize(22).font("Helvetica-Bold").fillColor("#000")
     .text("PACKING SLIP", M, y + 5, { width: 220, lineBreak: false });

  y += LOGO_H + 20;

  doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(1.2).stroke("#000000");
  y += 10;

  const lW = CONTENT_W * 0.6;
  const rX = M + lW;
  const rW = CONTENT_W * 0.4;
  const dt = new Date(billing.createdAt).toLocaleDateString("en-IN");

  const customerName = billing.customer?.name || "Walk-in Customer";
  const infoRows = [
    { l: ["M/s. :  ",      customerName],         r: ["Bill No :  ",      billing.billNumber || ""] },
    { l: ["GST :  ",      customer.gstNumber || "-"],    r: ["Date :  ",         dt] },
    { l: ["Transport :  ", transport.name || "-"],       r: ["Station :  ", customer.station || "-"] },
  ];

  const lValW = lW - 75;
  const rValW = rW - 75;
  const PADDING = 8;
  doc.fontSize(12);

  infoRows.forEach(({ l, r }) => {
    doc.font("Helvetica");
    const lh = doc.heightOfString(l[1], { width: lValW });
    const rh = doc.heightOfString(r[1], { width: rValW });
    const rowH = Math.max(lh, rh) + PADDING * 2;

    doc.rect(M, y, CONTENT_W, rowH).lineWidth(1.1).stroke("#000000");
    doc.moveTo(rX, y).lineTo(rX, y + rowH).lineWidth(1.1).stroke("#000000");

    const ry = y + PADDING;

    doc.font("Helvetica-Bold").fillColor("#000").text(l[0], M + 10, ry, { lineBreak: false, width: 70 });
    doc.font("Helvetica").fillColor("#000").text(l[1], M + 10 + 70, ry, { width: lValW, lineBreak: true });

    doc.font("Helvetica-Bold").fillColor("#000").text(r[0], rX + 10, ry, { lineBreak: false, width: 70 });
    doc.font("Helvetica").fillColor("#000").text(r[1], rX + 10 + 70, ry, { width: rValW, lineBreak: true });

    y += rowH;
  });

  y += 15;

  const tableRows = grouped.map((row, idx) => [
    String(idx + 1),
    row.designNo,
    row.sku,
    String(row.price),
    String(row.pieces),
  ]);

  drawTable(doc, M, y, COLS, tableRows, HDR_H, ROW_H);
  y += HDR_H + grouped.length * ROW_H;

  const TOTAL_H = 30;
  doc.rect(M, y, TABLE_W, TOTAL_H).lineWidth(1.1).stroke("#000000");
  const totalPieces = grouped.reduce((s, r) => s + (r.pieces || 0), 0);
  doc.fontSize(14).font("Helvetica-Bold").fillColor("#000")
     .text(`TOTAL PIECES : ${totalPieces}`, M, y + (TOTAL_H - 14) / 2, {
       width: TABLE_W - 15, align: "right", lineBreak: false,
     });

  const FOOTER_H = 65;
  const footerY = PAGE_H - M - FOOTER_H;

  doc.rect(M, footerY, CONTENT_W, FOOTER_H).lineWidth(1.1).stroke("#000000");
  
  doc.fontSize(10).font("Helvetica").fillColor("#000")
     .text("1. Received the above goods in good condition.", M + 12, footerY + 12, { lineBreak: false })
     .text("2. Subject to Surat Jurisdiction.", M + 12, footerY + 26, { lineBreak: false });

  doc.moveTo(M, footerY + 40).lineTo(M + CONTENT_W, footerY + 40).lineWidth(0.5).stroke("#bbbbbb");

  doc.fontSize(11).font("Helvetica-Bold").fillColor("#000")
     .text("PACKED BY : _______________", M + 12, footerY + 45, { lineBreak: false });

  const sigDivX = M + CONTENT_W / 2; // Keep for positioning text
  doc.text("CHECKED BY : _______________", sigDivX + 12, footerY + 45, { lineBreak: false });

  doc.rect(M, PAGE_H - M - 2.5, CONTENT_W, 2.5).fill("#000000");

  doc.end();
}

module.exports = { generatePackingSlipPDF };
