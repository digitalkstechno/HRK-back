const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const PAGE_W = 595;
const PAGE_H = 842;
const HALF_H = 421;
const M = 20;
const CONTENT_W = PAGE_W - M * 2; // 555

const COLS = [
  { h: "Sr.",       w: 32,  align: "center" },
  { h: "Design No", w: 110, align: "center" },
  { h: "Color/SKU", w: 110, align: "center" },
  { h: "Size",      w: 243, align: "center" },
  { h: "Qty",       w: 60,  align: "center" },
];
const TABLE_W = COLS.reduce((s, c) => s + c.w, 0); // 555

function colX(idx) {
  let x = M;
  for (let i = 0; i < idx; i++) x += COLS[i].w;
  return x;
}

function groupItems(items) {
  const map = new Map();
  for (const item of items) {
    const prod = item.product || {};
    const key = String(prod._id || item.productName);
    if (!map.has(key)) {
      map.set(key, {
        designNo: prod.designNo || "",
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

// Draw a proper table: fills first, then all borders on top
function drawTable(doc, startX, startY, cols, rows, HDR_H, ROW_H) {
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const totalRows = rows.length;

  // ── 1. Fill header background ──────────────────────────────────────────────
  doc.save();
  doc.rect(startX, startY, totalW, HDR_H).fill("#1a1a1a");
  doc.restore();

  // ── 2. Fill data row backgrounds ──────────────────────────────────────────
  rows.forEach((_, idx) => {
    const ry = startY + HDR_H + idx * ROW_H;
    const bg = idx % 2 === 0 ? "#ffffff" : "#eef1ff";
    doc.save();
    doc.rect(startX, ry, totalW, ROW_H).fill(bg);
    doc.restore();
  });

  // ── 3. Draw header text ────────────────────────────────────────────────────
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#ffffff");
  cols.forEach((col, i) => {
    const cx = startX + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
    doc.text(col.h, cx + 3, startY + (HDR_H - 9) / 2 + 1, {
      width: col.w - 6, align: "center", lineBreak: false,
    });
  });

  // ── 4. Draw row text ───────────────────────────────────────────────────────
  doc.fillColor("#000");
  rows.forEach((cells, idx) => {
    const ry = startY + HDR_H + idx * ROW_H;
    cells.forEach((val, ci) => {
      const cx = startX + cols.slice(0, ci).reduce((s, c) => s + c.w, 0);
      doc.fontSize(9)
         .font(ci === 4 ? "Helvetica-Bold" : "Helvetica")
         .fillColor("#000")
         .text(String(val), cx + 4, ry + (ROW_H - 9) / 2 + 1, {
           width: cols[ci].w - 8, align: cols[ci].align, lineBreak: false,
         });
    });
  });

  // ── 5. Draw ALL borders on top (after all fills) ───────────────────────────
  const tableH = HDR_H + totalRows * ROW_H;

  // Outer border — thick
  doc.save();
  doc.rect(startX, startY, totalW, tableH).lineWidth(1.5).stroke("#000000");
  doc.restore();

  // Horizontal line below header
  doc.save();
  doc.moveTo(startX, startY + HDR_H)
     .lineTo(startX + totalW, startY + HDR_H)
     .lineWidth(1.2).stroke("#000000");
  doc.restore();

  // Horizontal lines between rows
  for (let i = 1; i < totalRows; i++) {
    const ry = startY + HDR_H + i * ROW_H;
    doc.save();
    doc.moveTo(startX, ry).lineTo(startX + totalW, ry)
       .lineWidth(0.4).stroke("#bbbbbb");
    doc.restore();
  }

  // Vertical column separator lines (full height)
  let cx = startX;
  cols.slice(0, -1).forEach((col) => {
    cx += col.w;
    doc.save();
    doc.moveTo(cx, startY).lineTo(cx, startY + tableH)
       .lineWidth(0.5).stroke("#888888");
    doc.restore();
  });
}

function generatePackingSlipPDF(billing, res) {
  const customer  = billing.customer  || {};
  const transport = customer.transport || {};
  const grouped   = groupItems(billing.items || []);

  const ROW_H = 18;
  const HDR_H = 20;

  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="packing-slip-${billing.billNumber}.pdf"`);
  doc.pipe(res);

  let y = M + 2;

  // ════════════════════════════════════════════════════════════════════════════
  // HEADER — PACKING SLIP (left) | Phones (right)
  // ════════════════════════════════════════════════════════════════════════════
  const phoneBlockW = 150;
  const titleW = CONTENT_W - phoneBlockW;

  doc.fontSize(15).font("Helvetica-Bold").fillColor("#000")
     .text("PACKING SLIP", M, y + 4, { width: titleW, lineBreak: false });

  const phones = ["Mo. 99136 39997", "90332 52577", "97125 34039"];
  doc.fontSize(9).font("Helvetica").fillColor("#222");
  phones.forEach((p, i) => {
    doc.text(p, M + titleW, y + i * 13, { width: phoneBlockW, align: "right", lineBreak: false });
  });

  y += 44;

  doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(0.6).stroke("#cccccc");
  y += 5;

  // ════════════════════════════════════════════════════════════════════════════
  // LOGO + GST
  // ════════════════════════════════════════════════════════════════════════════
  const logoPath = path.join(__dirname, "../public/hrk_logo.png");
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, PAGE_W / 2 - 30, y, { width: 60, height: 30 });
  } else {
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000")
       .text("HRK", 0, y + 6, { width: PAGE_W, align: "center" });
  }
  y += 34;

  doc.fontSize(9).font("Helvetica").fillColor("#444")
     .text("GSTNO: 24ADEFS1747D1ZC", 0, y, { width: PAGE_W, align: "center" });
  y += 14;

  doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(1.2).stroke("#000000");
  y += 8;

  // ════════════════════════════════════════════════════════════════════════════
  // INFO ROWS (70 | 30)
  // ════════════════════════════════════════════════════════════════════════════
  const lW = CONTENT_W * 0.70;
  const rX = M + lW;
  const rW = CONTENT_W * 0.30;
  const dt = new Date(billing.createdAt).toLocaleDateString("en-IN");

  const infoRows = [
    { l: ["M/s. : ",        customer.name || ""],              r: ["Bill No : ",      billing.billNumber || ""] },
    { l: ["Party GST : ",   customer.gstNumber || "-"],        r: ["Date : ",         dt] },
    { l: ["Transport : ",   transport.name || "-"],            r: ["Station/City : ", customer.station || "-"] },
  ];

  const INFO_ROW_H = 17;
  const infoBlockH = infoRows.length * INFO_ROW_H;

  // Info section outer border
  doc.save();
  doc.rect(M, y, CONTENT_W, infoBlockH).lineWidth(1).stroke("#000000");
  doc.restore();

  // Vertical divider between left/right
  doc.save();
  doc.moveTo(rX, y).lineTo(rX, y + infoBlockH).lineWidth(0.6).stroke("#000000");
  doc.restore();

  // Horizontal dividers between info rows
  for (let i = 1; i < infoRows.length; i++) {
    doc.save();
    doc.moveTo(M, y + i * INFO_ROW_H).lineTo(M + CONTENT_W, y + i * INFO_ROW_H)
       .lineWidth(0.4).stroke("#bbbbbb");
    doc.restore();
  }

  doc.fontSize(9);
  infoRows.forEach(({ l, r }, i) => {
    const ry = y + i * INFO_ROW_H + 4;
    doc.font("Helvetica-Bold").fillColor("#555")
       .text(l[0], M + 4, ry, { lineBreak: false, width: 80 });
    const lLabelW = doc.widthOfString(l[0]);
    doc.font("Helvetica").fillColor("#000")
       .text(l[1], M + 4 + lLabelW, ry, { lineBreak: false, width: lW - lLabelW - 8 });

    doc.font("Helvetica-Bold").fillColor("#555")
       .text(r[0], rX + 6, ry, { lineBreak: false, width: 80 });
    const rLabelW = doc.widthOfString(r[0]);
    doc.font("Helvetica").fillColor("#000")
       .text(r[1], rX + 6 + rLabelW, ry, { lineBreak: false, width: rW - rLabelW - 10 });
  });

  y += infoBlockH + 6;

  // ════════════════════════════════════════════════════════════════════════════
  // MAIN TABLE
  // ════════════════════════════════════════════════════════════════════════════
  const tableRows = grouped.map((row, idx) => [
    String(idx + 1),
    row.designNo,
    row.sku,
    row.sizes,
    String(row.qty),
  ]);

  drawTable(doc, M, y, COLS, tableRows, HDR_H, ROW_H);

  y += HDR_H + grouped.length * ROW_H;

  // ════════════════════════════════════════════════════════════════════════════
  // TOTAL ROW
  // ════════════════════════════════════════════════════════════════════════════
  const TOTAL_H = 22;
  doc.save();
  doc.rect(M, y, TABLE_W, TOTAL_H).fill("#e8eeff");
  doc.restore();
  doc.save();
  doc.rect(M, y, TABLE_W, TOTAL_H).lineWidth(1.5).stroke("#000000");
  doc.restore();
  const totalQty = grouped.reduce((s, r) => s + r.qty, 0);
  doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#000")
     .text(`Total Qty :   ${totalQty}`, M, y + 6, {
       width: TABLE_W - 10, align: "right", lineBreak: false,
     });
  y += TOTAL_H;

  // ════════════════════════════════════════════════════════════════════════════
  // FOOTER SECTION with border
  // ════════════════════════════════════════════════════════════════════════════
  const FOOTER_H = 46;
  doc.save();
  doc.rect(M, y, CONTENT_W, FOOTER_H).lineWidth(1).stroke("#000000");
  doc.restore();

  // Vertical divider for signatures
  const sigDivX = M + CONTENT_W * 0.5;
  doc.save();
  doc.moveTo(sigDivX, y + 24).lineTo(sigDivX, y + FOOTER_H)
     .lineWidth(0.5).stroke("#aaaaaa");
  doc.restore();

  // Footer text
  doc.fontSize(8.5).font("Helvetica").fillColor("#333")
     .text("Received the above mentioned goods in good condition.", M + 6, y + 5, { lineBreak: false });
  doc.text("Subject to Surat Jurisdiction.", M + 6, y + 17, { lineBreak: false });

  // Horizontal divider above signatures
  doc.save();
  doc.moveTo(M, y + 26).lineTo(M + CONTENT_W, y + 26)
     .lineWidth(0.5).stroke("#aaaaaa");
  doc.restore();

  // Signatures
  doc.fontSize(9).font("Helvetica").fillColor("#000")
     .text("Packed By : ___________________", M + 6, y + 31, { lineBreak: false });
  doc.text("Checked By : ___________________", sigDivX + 6, y + 31, { lineBreak: false });

  y += FOOTER_H;

  // ════════════════════════════════════════════════════════════════════════════
  // CUT LINE
  // ════════════════════════════════════════════════════════════════════════════
  // doc.moveTo(0, HALF_H).lineTo(PAGE_W, HALF_H)
  //    .lineWidth(0.5).dash(5, { space: 5 }).stroke("#999999");
  // doc.undash();
  // doc.fontSize(7).fillColor("#aaaaaa")
  //    .text("✂  cut here", PAGE_W - 72, HALF_H + 3, { lineBreak: false });

  doc.end();
}

module.exports = { generatePackingSlipPDF };
