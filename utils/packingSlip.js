const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const PAGE_W = 595;
const PAGE_H = 420; // Changed to A5 Landscape
const M = 25; // Slightly smaller margins to save space
const CONTENT_W = PAGE_W - M * 2;

const COLS = [
  { h: "Sr.",       w: 30,  align: "center" },
  { h: "Design No", w: 140, align: "center" },
  { h: "Color/SKU", w: 140, align: "center" },
  { h: "Price",     w: 100, align: "center" },
  { h: "Qty",       w: 135, align: "center" },
];
const TABLE_W = CONTENT_W;

function groupItems(items) {
  const map = new Map();
  for (const item of items) {
    const prod = item.product || {};
    const key = String(prod._id || item.productName);
    if (!map.has(key)) {
      map.set(key, {
        designNo: prod.designNo || item.productName || "",
        sku:      prod.sku      || "",
        sizes:    Array.isArray(prod.sizes)
                    ? prod.sizes.map((s) => s.name || String(s)).join(", ")
                    : "",
        qty:   0,
        price: item.price || 0,
        total: 0,
      });
    }
    const g = map.get(key);
    g.qty   += item.qty   || 0;
    g.total += item.total || 0;
  }
  return Array.from(map.values());
}

function drawTable(doc, startX, startY, cols, rows, HDR_H, ROW_H) {
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const totalRows = rows.length;
  const tableH = HDR_H + totalRows * ROW_H;

  // Header background — solid black
  doc.rect(startX, startY, totalW, HDR_H).fill("#000000");

  // Alternating row backgrounds
  rows.forEach((_, idx) => {
    const ry = startY + HDR_H + idx * ROW_H;
    doc.rect(startX, ry, totalW, ROW_H).fill(idx % 2 === 0 ? "#ffffff" : "#f7f7f7");
  });

  // Header text — white
  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#ffffff");
  cols.forEach((col, i) => {
    const cx = startX + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
    doc.text(col.h, cx + 3, startY + (HDR_H - 8.5) / 2 + 1, {
      width: col.w - 6, align: "center", lineBreak: false,
    });
  });

  // Row text — black
  rows.forEach((cells, idx) => {
    const ry = startY + HDR_H + idx * ROW_H;
    cells.forEach((val, ci) => {
      const cx = startX + cols.slice(0, ci).reduce((s, c) => s + c.w, 0);
      const isQty = ci === cols.length - 1;
      doc.fontSize(8.5)
         .font(isQty ? "Helvetica-Bold" : "Helvetica")
         .fillColor("#000000")
         .text(String(val), cx + 4, ry + (ROW_H - 8.5) / 2 + 1, {
           width: cols[ci].w - 8, align: cols[ci].align, lineBreak: false,
         });
    });
  });

  // Outer border
  doc.rect(startX, startY, totalW, tableH).lineWidth(1).stroke("#000000");

  // Header bottom border
  doc.moveTo(startX, startY + HDR_H)
     .lineTo(startX + totalW, startY + HDR_H)
     .lineWidth(1).stroke("#000000");

  // Row dividers
  for (let i = 1; i < totalRows; i++) {
    const ry = startY + HDR_H + i * ROW_H;
    doc.moveTo(startX, ry).lineTo(startX + totalW, ry)
       .lineWidth(0.3).stroke("#cccccc");
  }

  // Column dividers
  let cx = startX;
  cols.slice(0, -1).forEach((col) => {
    cx += col.w;
    doc.moveTo(cx, startY).lineTo(cx, startY + tableH)
       .lineWidth(0.5).stroke("#000000");
  });
}

function generatePackingSlipPDF(billing, res) {
  const customer  = billing.customer  || {};
  const transport = customer.transport || {};
  const grouped   = groupItems(billing.items || []);

  const ROW_H = 17; // Reduced row height
  const HDR_H = 18; // Reduced header height

  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="packing-slip-${billing.billNumber}.pdf"`);
  doc.pipe(res);

  let y = M;

  // ── TOP BORDER LINE ────────────────────────────────────────────────────────
  doc.rect(M, y, CONTENT_W, 2).fill("#000000");
  y += 10;

  // ── HEADER: Logo center, phones right, title left ─────────────────────────
  const logoPath = path.join(__dirname, "../public/hrk_logo.png");
  const LOGO_W = 60, LOGO_H = 30;

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, PAGE_W / 2 - LOGO_W / 2, y, { width: LOGO_W, height: LOGO_H });
  } else {
    doc.fontSize(16).font("Helvetica-Bold").fillColor("#000")
       .text("HRK", 0, y + 4, { width: PAGE_W, align: "center", lineBreak: false });
  }

  // Company name & GST below logo
  doc.fontSize(7).font("Helvetica").fillColor("#555")
     .text("GST: 24ADEFS1747D1ZC", 0, y + LOGO_H + 2, { width: PAGE_W, align: "center", lineBreak: false });

  // Phones — right side
  const phones = ["99136 39997", "90332 52577", "97125 34039"];
  doc.fontSize(7.5).font("Helvetica").fillColor("#000");
  phones.forEach((p, i) => {
    doc.text(p, PAGE_W - M - 110, y + i * 11, { width: 110, align: "right", lineBreak: false });
  });

  // PACKING SLIP title — left side
  doc.fontSize(14).font("Helvetica-Bold").fillColor("#000")
     .text("PACKING SLIP", M, y + 6, { width: 160, lineBreak: false });

  y += LOGO_H + 12;

  // ── DIVIDER ────────────────────────────────────────────────────────────────
  doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(1).stroke("#000000");
  y += 6;

  // ── INFO BLOCK ─────────────────────────────────────────────────────────────
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

  const INFO_ROW_H = 15;
  const infoBlockH = infoRows.length * INFO_ROW_H;

  // Outer box
  doc.rect(M, y, CONTENT_W, infoBlockH).lineWidth(0.8).stroke("#000000");

  // Vertical divider
  doc.moveTo(rX, y).lineTo(rX, y + infoBlockH).lineWidth(0.8).stroke("#000000");

  // Horizontal dividers
  for (let i = 1; i < infoRows.length; i++) {
    doc.moveTo(M, y + i * INFO_ROW_H)
       .lineTo(M + CONTENT_W, y + i * INFO_ROW_H)
       .lineWidth(0.3).stroke("#aaaaaa");
  }

  doc.fontSize(8);
  infoRows.forEach(({ l, r }, i) => {
    const ry = y + i * INFO_ROW_H + (INFO_ROW_H - 8) / 2;

    doc.font("Helvetica-Bold").fillColor("#000")
       .text(l[0], M + 5, ry, { lineBreak: false, width: 70 });
    const lw = doc.widthOfString(l[0]);
    doc.font("Helvetica").fillColor("#000")
       .text(l[1], M + 5 + lw, ry, { lineBreak: false, width: lW - lw - 10 });

    doc.font("Helvetica-Bold").fillColor("#000")
       .text(r[0], rX + 5, ry, { lineBreak: false, width: 80 });
    const rw = doc.widthOfString(r[0]);
    doc.font("Helvetica").fillColor("#000")
       .text(r[1], rX + 5 + rw, ry, { lineBreak: false, width: rW - rw - 10 });
  });

  y += infoBlockH + 6;

  // ── MAIN TABLE ─────────────────────────────────────────────────────────────
  const tableRows = grouped.map((row, idx) => [
    String(idx + 1),
    row.designNo,
    row.sku,
    String(row.price),
    String(row.qty),
  ]);

  drawTable(doc, M, y, COLS, tableRows, HDR_H, ROW_H);
  y += HDR_H + grouped.length * ROW_H;

  // ── TOTAL ROW ──────────────────────────────────────────────────────────────
  const TOTAL_H = 18;
  doc.rect(M, y, TABLE_W, TOTAL_H).lineWidth(0.8).stroke("#000000");

  const totalQty = grouped.reduce((s, r) => s + r.qty, 0);

  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#000")
     .text(`Total Qty : ${totalQty}`, M, y + (TOTAL_H - 8.5) / 2, {
       width: TABLE_W - 12, align: "right", lineBreak: false,
     });

  y += TOTAL_H + 6;

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  const FOOTER_H = 45;
  doc.rect(M, y, CONTENT_W, FOOTER_H).lineWidth(0.8).stroke("#000000");

  // Vertical divider
  const sigDivX = M + CONTENT_W / 2;
  doc.moveTo(sigDivX, y).lineTo(sigDivX, y + FOOTER_H).lineWidth(0.5).stroke("#000000");

  // Terms text
  doc.fontSize(7.5).font("Helvetica").fillColor("#000")
     .text("Received the above goods in good condition.", M + 6, y + 6, { lineBreak: false })
     .text("Subject to Surat Jurisdiction.", M + 6, y + 16, { lineBreak: false });

  // Horizontal divider above signatures
  doc.moveTo(M, y + 28).lineTo(M + CONTENT_W, y + 28).lineWidth(0.3).stroke("#aaaaaa");

  // Signature labels
  doc.fontSize(7.5).font("Helvetica").fillColor("#000")
     .text("Packed By : _____________________", M + 6, y + 33, { lineBreak: false });
  doc.text("Checked By : ____________________", sigDivX + 6, y + 33, { lineBreak: false });

  y += FOOTER_H + 4;

  // ── BOTTOM BORDER LINE ─────────────────────────────────────────────────────
  doc.rect(M, y, CONTENT_W, 1.5).fill("#000000");

  doc.end();
}

module.exports = { generatePackingSlipPDF };
