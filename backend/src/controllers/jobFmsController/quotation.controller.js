// controllers/quotation.controller.js
import db from "../../models/index.js"; // adjust path to match your project
const { Quotation } = db;
import puppeteer from "puppeteer";
import path      from "path";
import fs        from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER SINGLETON — launch once, reuse across all requests
// ~200ms per PDF instead of ~1.5s with fresh launch each time
// ─────────────────────────────────────────────────────────────────────────────
let _browser     = null;
let _launchingP  = null;

async function getBrowser() {
  if (_browser?.isConnected()) return _browser;
  if (_launchingP)             return _launchingP;

  _launchingP = puppeteer
    .launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--mute-audio",
      ],
    })
    .then((b) => {
      _browser    = b;
      _launchingP = null;
      b.on("disconnected", () => { _browser = null; });
      return b;
    });

  return _launchingP;
}

// Graceful shutdown hook (call in your app teardown)
export async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRM CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const FIRMS = {
  "Eastern Panorama Offset": {
    template:   "epo.html",
    headerSvg:  "EPO_HEADER.svg",
    footerSvg:  "EPO_FOOTER.svg",
    refPrefix:  "EPO",
    address:    "2nd Floor, RPG Complex, Keating Road, Shillong - 793001",
    phone:      "0364 - 2504885",
    email:      "office@easternpanorama.in",
    signName:   "Eastern Panorama Offset",
    subject:    "Quotation for Printing Services",
  },
  "Darilin Tang": {
    template:   "dtang.html",
    headerSvg:  "DTANG_HEADER.svg",
    footerSvg:  "DTANG_FOOTER.svg",
    refPrefix:  "DT",
    address:    "Shillong, Meghalaya - 793001",
    phone:      "",
    email:      "",
    signName:   "Darilin Tang",
    subject:    "Quotation for Printing & Publishing Work",
  },
  "MM Enterprise": {
    template:   "mm.html",
    headerSvg:  "MM_HEADER.svg",
    footerSvg:  "MM_FOOTER.svg",
    refPrefix:  "MME",
    address:    "Shillong, Meghalaya - 793001",
    phone:      "",
    email:      "",
    signName:   "MM Enterprise",
    subject:    "Quotation",
  },
  "Hill Publication": {
    template:   "hill.html",
    headerSvg:  "HILL_HEADER.svg",
    footerSvg:  "HILL_FOOTER.svg",
    refPrefix:  "HP",
    address:    "Shillong, Meghalaya - 793001",
    phone:      "",
    email:      "",
    signName:   "Hill Publication",
    subject:    "Quotation for Book Printing / Publication Work",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT IN WORDS — Indian numbering (Crore, Lakh, Thousand)
// ─────────────────────────────────────────────────────────────────────────────
const _ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const _TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function _toWords(n) {
  if (n === 0)    return "";
  if (n < 20)     return _ONES[n];
  if (n < 100)    return _TENS[Math.floor(n / 10)] + (n % 10 ? " " + _ONES[n % 10] : "");
  if (n < 1000)   return _ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + _toWords(n % 100) : "");
  if (n < 100000) return _toWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + _toWords(n % 1000) : "");
  if (n < 10000000) return _toWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + _toWords(n % 100000) : "");
  return _toWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + _toWords(n % 10000000) : "");
}

function amountInWords(amount) {
  const val    = Math.round(Number(amount || 0) * 100) / 100;
  const rupees = Math.floor(val);
  const paise  = Math.round((val - rupees) * 100);
  let result   = "Rupees " + (_toWords(rupees) || "Zero");
  if (paise > 0) result += " and " + _toWords(paise) + " Paise";
  return result + " Only";
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (n) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inr = (n) => `&#x20B9;&nbsp;${fmt(n)}`;


const computeBilling = (subtotal, discount, gstPct) => {
  const sub   = parseFloat(Number(subtotal  || 0).toFixed(2));
  const disc  = parseFloat(Math.min(Number(discount || 0), sub).toFixed(2));
  const after = parseFloat((sub - disc).toFixed(2));
  const rate  = gstPct ? Number(gstPct) : 0;
  const gst   = parseFloat(((after * rate) / 100).toFixed(2));
  const final = parseFloat((after + gst).toFixed(2));
  return { subtotal: sub, discount: disc, gstAmount: gst, finalAmount: final };
};

const VALID_FIRMS = new Set([
  "Eastern Panorama Offset",
  "Darilin Tang",
  "MM Enterprise",
  "Hill Publication",
]);



// Prepare SVG: make it full-width, strip xml declaration
function prepareSvg(svgStr) {
  return svgStr
    .replace(/<\?xml[^?]*\?>\s*/g, "")
    .replace(/<svg([^>]*)>/,  (_, attrs) => {
      // Remove existing width/height attrs; add display:block width:100%
      const cleaned = attrs
        .replace(/\s+width="[^"]*"/g, "")
        .replace(/\s+height="[^"]*"/g, "");
      return `<svg${cleaned} style="display:block;width:100%;height:auto;">`;
    });
}

// Item description block — shared across all firms
function descriptionHtml(item) {
  const sub = [];
  if (item.size)  sub.push(`Size: ${item.size}`);

  if (item.category === "Single Sheet") {
    if (item.paper_type)  sub.push(`Paper: ${item.paper_type}${item.paper_gsm ? ` ${item.paper_gsm} GSM` : ""}`);
    if (item.sides)       sub.push(item.sides);
    if (item.color_scheme) sub.push(item.color_scheme);
  }
  if (item.category === "Multiple Sheet") {
    if (item.inside_pages) sub.push(`${item.inside_pages} Pages`);
    const papers = (item.inside_papers || []).filter(p => p.paper_type);
    papers.forEach((p, i) =>
      sub.push(`Inside${papers.length > 1 ? ` Paper ${i + 1}` : ""}: ${p.paper_type}${p.paper_gsm ? ` ${p.paper_gsm} GSM` : ""}`)
    );
    if (item.cover_paper_type)
      sub.push(`Cover: ${item.cover_paper_type}${item.cover_paper_gsm ? ` ${item.cover_paper_gsm} GSM` : ""} (${item.cover_pages || "?"} pg)`);
    if (item.sides) sub.push(item.sides);
  }
  if (item.category === "Wide Format" && item.wide_material_name)
    sub.push(`Material: ${item.wide_material_name}`);

  return `<strong>${item.enquiry_for || "—"}</strong>${sub.length ? `<br/><small>${sub.join(" &bull; ")}</small>` : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRM-SPECIFIC TABLE ROW BUILDERS
// Each returns { headHtml, bodyHtml, billingHtml }
// ─────────────────────────────────────────────────────────────────────────────

// EPO: S.No | Description | Qty | UOM | Rate | Amount [| GST | Total]
function buildEpoTable(items, billing) {
  const hasGst = billing.gstPct && Number(billing.gstPct) > 0;
  const gstRate = Number(billing.gstPct || 0);

  const headHtml = `
    <tr>
      <th class="c" style="width:28px">S.No</th>
      <th class="l">Description</th>
      <th class="c" style="width:34px">Qty</th>
      <th class="c" style="width:36px">UOM</th>
      <th class="r" style="width:60px">Rate (&#x20B9;)</th>
      <th class="r" style="width:64px">Amount (&#x20B9;)</th>
      ${hasGst ? `<th class="r" style="width:48px">GST ${gstRate}%</th><th class="r" style="width:64px">Total (&#x20B9;)</th>` : ""}
    </tr>`;

  const bodyHtml = items.map((it, i) => {
    const amt = Number(it.item_total || 0);
    const rate = Number(it.unit_rate || 0);
    const gstAmt = hasGst ? parseFloat(((amt * gstRate) / 100).toFixed(2)) : 0;
    const total  = hasGst ? parseFloat((amt + gstAmt).toFixed(2)) : 0;
    return `<tr>
      <td class="c">${i + 1}</td>
      <td class="l">${descriptionHtml(it)}</td>
      <td class="c">${it.quantity || "—"}</td>
      <td class="c">${it.uom || "—"}</td>
      <td class="r">${fmt(rate)}</td>
      <td class="r">${fmt(amt)}</td>
      ${hasGst ? `<td class="r">${fmt(gstAmt)}</td><td class="r">${fmt(total)}</td>` : ""}
    </tr>`;
  }).join("\n");

  const cols = hasGst ? 8 : 6;

  const billingHtml = `
    <tr class="subtotal-row">
      <td colspan="${cols - 1}" class="r"><strong>Total Amount</strong></td>
      <td class="r"><strong>${fmt(billing.subtotal)}</strong></td>
    </tr>
    ${hasGst ? `
    <tr class="subtotal-row">
      <td colspan="${cols - 1}" class="r">GST @ ${gstRate}%</td>
      <td class="r">${fmt(billing.gstAmount)}</td>
    </tr>` : ""}
    <tr class="final-row">
      <td colspan="${cols - 1}" class="r">Final Amount</td>
      <td class="r">${fmt(billing.finalAmount)}</td>
    </tr>
    <tr class="words-row">
      <td colspan="${cols}" class="l"><em>Amount in Words: ${amountInWords(billing.finalAmount)}</em></td>
    </tr>`;

  return { headHtml, bodyHtml, billingHtml };
}

// Darilin Tang: Sl. No. | Specification | Qty | UOM | Rate | Amount [| GST | Total]
function buildDtangTable(items, billing) {
  const hasGst  = billing.gstPct && Number(billing.gstPct) > 0;
  const gstRate = Number(billing.gstPct || 0);

  const headHtml = `
    <tr>
      <th class="c" style="width:32px">Sl. No.</th>
      <th class="l">Specification</th>
      <th class="c" style="width:36px">Qty</th>
      <th class="c" style="width:36px">UOM</th>
      <th class="r" style="width:60px">Rate (&#x20B9;)</th>
      <th class="r" style="width:64px">Amount (&#x20B9;)</th>
      ${hasGst ? `<th class="r" style="width:48px">GST ${gstRate}%</th><th class="r" style="width:64px">Total (&#x20B9;)</th>` : ""}
    </tr>`;

  const bodyHtml = items.map((it, i) => {
    const amt    = Number(it.item_total || 0);
    const rate   = Number(it.unit_rate  || 0);
    const gstAmt = hasGst ? parseFloat(((amt * gstRate) / 100).toFixed(2)) : 0;
    const total  = hasGst ? parseFloat((amt + gstAmt).toFixed(2)) : 0;
    return `<tr>
      <td class="c">${i + 1}</td>
      <td class="l">${descriptionHtml(it)}</td>
      <td class="c">${it.quantity || "—"}</td>
      <td class="c">${it.uom || "—"}</td>
      <td class="r">${fmt(rate)}</td>
      <td class="r">${fmt(amt)}</td>
      ${hasGst ? `<td class="r">${fmt(gstAmt)}</td><td class="r">${fmt(total)}</td>` : ""}
    </tr>`;
  }).join("\n");

  const cols = hasGst ? 8 : 6;

  const billingHtml = `
    <tr class="subtotal-row">
      <td colspan="${cols - 1}" class="r"><strong>Total</strong></td>
      <td class="r"><strong>${fmt(billing.subtotal)}</strong></td>
    </tr>
    ${hasGst ? `
    <tr class="subtotal-row">
      <td colspan="${cols - 1}" class="r">GST @ ${gstRate}%</td>
      <td class="r">${fmt(billing.gstAmount)}</td>
    </tr>` : ""}
    <tr class="final-row">
      <td colspan="${cols - 1}" class="r">Final Amount</td>
      <td class="r">${fmt(billing.finalAmount)}</td>
    </tr>
    <tr class="words-row">
      <td colspan="${cols}" class="l"><em>In Words: ${amountInWords(billing.finalAmount)}</em></td>
    </tr>`;

  return { headHtml, bodyHtml, billingHtml };
}

// MM Enterprise: Serial No. | Job Description | Quantity | Unit Rate | Amount [| GST | Grand Total]
function buildMmTable(items, billing) {
  const hasGst  = billing.gstPct && Number(billing.gstPct) > 0;
  const gstRate = Number(billing.gstPct || 0);

  const headHtml = `
    <tr>
      <th class="c" style="width:34px">Serial No.</th>
      <th class="l">Job Description</th>
      <th class="c" style="width:50px">Quantity</th>
      <th class="r" style="width:64px">Unit Rate (&#x20B9;)</th>
      <th class="r" style="width:68px">Amount (&#x20B9;)</th>
      ${hasGst ? `<th class="r" style="width:50px">GST ${gstRate}%</th><th class="r" style="width:68px">Grand Total (&#x20B9;)</th>` : ""}
    </tr>`;

  const bodyHtml = items.map((it, i) => {
    const amt    = Number(it.item_total || 0);
    const rate   = Number(it.unit_rate  || 0);
    const gstAmt = hasGst ? parseFloat(((amt * gstRate) / 100).toFixed(2)) : 0;
    const grand  = hasGst ? parseFloat((amt + gstAmt).toFixed(2)) : 0;
    return `<tr>
      <td class="c">${i + 1}</td>
      <td class="l">${descriptionHtml(it)}</td>
      <td class="c">${it.quantity || "—"}${it.uom ? " " + it.uom : ""}</td>
      <td class="r">${fmt(rate)}</td>
      <td class="r">${fmt(amt)}</td>
      ${hasGst ? `<td class="r">${fmt(gstAmt)}</td><td class="r">${fmt(grand)}</td>` : ""}
    </tr>`;
  }).join("\n");

  const cols = hasGst ? 7 : 5;

  const billingHtml = `
    <tr class="subtotal-row">
      <td colspan="${cols - 1}" class="r"><strong>Total Amount</strong></td>
      <td class="r"><strong>${fmt(billing.subtotal)}</strong></td>
    </tr>
    ${hasGst ? `
    <tr class="subtotal-row">
      <td colspan="${cols - 1}" class="r">GST @ ${gstRate}%</td>
      <td class="r">${fmt(billing.gstAmount)}</td>
    </tr>` : ""}
    <tr class="final-row">
      <td colspan="${cols - 1}" class="r">Final Amount</td>
      <td class="r">${fmt(billing.finalAmount)}</td>
    </tr>
    <tr class="words-row">
      <td colspan="${cols}" class="l"><em>In Words: ${amountInWords(billing.finalAmount)}</em></td>
    </tr>`;

  return { headHtml, bodyHtml, billingHtml };
}

// Hill Publication: Serial No | Item | QTY | UOM | Rate | Total Excl. GST [| GST | Total Incl. GST]
function buildHillTable(items, billing) {
  const hasGst  = billing.gstPct && Number(billing.gstPct) > 0;
  const gstRate = Number(billing.gstPct || 0);

  const headHtml = `
    <tr>
      <th class="c" style="width:34px">Serial No.</th>
      <th class="l">Item</th>
      <th class="c" style="width:34px">QTY</th>
      <th class="c" style="width:36px">UOM</th>
      <th class="r" style="width:60px">Rate (&#x20B9;)</th>
      <th class="r" style="width:72px">Total Excl. GST (&#x20B9;)</th>
      ${hasGst ? `<th class="r" style="width:50px">GST ${gstRate}%</th><th class="r" style="width:72px">Total Incl. GST (&#x20B9;)</th>` : ""}
    </tr>`;

  const bodyHtml = items.map((it, i) => {
    const amt    = Number(it.item_total || 0);
    const rate   = Number(it.unit_rate  || 0);
    const gstAmt = hasGst ? parseFloat(((amt * gstRate) / 100).toFixed(2)) : 0;
    const incl   = hasGst ? parseFloat((amt + gstAmt).toFixed(2)) : 0;
    return `<tr>
      <td class="c">${i + 1}</td>
      <td class="l">${descriptionHtml(it)}</td>
      <td class="c">${it.quantity || "—"}</td>
      <td class="c">${it.uom || "—"}</td>
      <td class="r">${fmt(rate)}</td>
      <td class="r">${fmt(amt)}</td>
      ${hasGst ? `<td class="r">${fmt(gstAmt)}</td><td class="r">${fmt(incl)}</td>` : ""}
    </tr>`;
  }).join("\n");

  const cols = hasGst ? 8 : 6;

  const billingHtml = `
    <tr class="subtotal-row">
      <td colspan="${cols - 1}" class="r"><strong>Total (Excl. GST)</strong></td>
      <td class="r"><strong>${fmt(billing.subtotal)}</strong></td>
    </tr>

    ${hasGst ? `
    <tr class="subtotal-row">
      <td colspan="${cols - 1}" class="r">GST @ ${gstRate}%</td>
      <td class="r">${fmt(billing.gstAmount)}</td>
    </tr>` : ""}
    <tr class="final-row">
      <td colspan="${cols - 1}" class="r">Final Amount (&#x20B9;)</td>
      <td class="r">${fmt(billing.finalAmount)}</td>
    </tr>
    <tr class="words-row">
      <td colspan="${cols}" class="l"><em>Amount in Words: ${amountInWords(billing.finalAmount)}</em></td>
    </tr>`;

  return { headHtml, bodyHtml, billingHtml };
}

const TABLE_BUILDERS = {
  "Eastern Panorama Offset": buildEpoTable,
  "Darilin Tang":             buildDtangTable,
  "MM Enterprise":           buildMmTable,
  "Hill Publication":        buildHillTable,
};

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE PROCESSOR — {{VAR}} and {{#if VAR}}...{{/if}}
// ─────────────────────────────────────────────────────────────────────────────
function processTemplate(html, vars) {
  // Conditionals first
  let out = html.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, content) => (vars[key] ? content : ""),
  );
  // Simple replacements
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value ?? "");
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────
export const generateQuotationPDF = async (req, res) => {
  const { clientName, department, clientAddress, items, billing, firmName } = req.body;

  // — Validate ----------------------------------------------------------------
  if (!clientName?.trim() || !firmName) {
    return res.status(400).json({ message: "clientName and firmName are required" });
  }
  const firm = FIRMS[firmName];
  if (!firm) {
    return res.status(400).json({ message: `Unknown firm: ${firmName}` });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "At least one item is required" });
  }

  // — Asset paths ------------------------------------------------------------
  const assetDir   = path.resolve(__dirname, "../../../assets");
  const tplDir     = path.resolve(__dirname, "../../templates/quotation");

  const headerPath = path.join(assetDir, firm.headerSvg);
  const footerPath = path.join(assetDir, firm.footerSvg);
  const tplPath    = path.join(tplDir, firm.template);

  for (const [label, p] of [["Template", tplPath], ["Header SVG", headerPath], ["Footer SVG", footerPath]]) {
    if (!fs.existsSync(p)) {
      return res.status(500).json({ message: `${label} not found: ${p}` });
    }
  }

  // — Read files (sync — fast because they're local) -------------------------
  const templateHtml = fs.readFileSync(tplPath, "utf-8");
  const headerSvg    = prepareSvg(fs.readFileSync(headerPath, "utf-8"));
  const footerSvg    = prepareSvg(fs.readFileSync(footerPath, "utf-8"));

  // — Build table ------------------------------------------------------------
  // const readyItems   = items.filter(it => it.item_total != null && it.unit_rate != null);
  const readyItems = items.filter(it => it.enquiry_for);
  const tableBuilder = TABLE_BUILDERS[firmName];
  const { headHtml, bodyHtml, billingHtml } = tableBuilder(readyItems, billing);

  // — Date / ref -------------------------------------------------------------
  const now     = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  // Use the DB-assigned ref no if passed, fall back to timestamp (for preview use)
  const refNo = req.body.quotationRefNo ? String(req.body.quotationRefNo) : now.getTime().toString().slice(-6);
  const year    = now.getFullYear();

  // — Template vars ----------------------------------------------------------
  const vars = {
    DATE:           dateStr,
    YEAR:           year,
    REF:            refNo,
    CLIENT_NAME:    clientName,
    DEPARTMENT:     department || "",
    CLIENT_ADDRESS: (clientAddress || "").replace(/\n/g, "<br/>"),
    FIRM_ADDRESS:   firm.address,
    FIRM_PHONE:     firm.phone,
    FIRM_EMAIL:     firm.email,
    SIGN_NAME:      firm.signName,
    SUBJECT:        firm.subject,
    HEADER_SVG:     headerSvg,
    FOOTER_SVG:     footerSvg,
    TABLE_HEAD:     headHtml,
    TABLE_BODY:     bodyHtml,
    TABLE_BILLING:  billingHtml,
    HAS_DEPARTMENT: !!department,
    HAS_ADDRESS:    !!clientAddress,
    HAS_PHONE:      !!firm.phone,
    HAS_EMAIL:      !!firm.email,
  };

  const finalHtml = processTemplate(templateHtml, vars);

  // — Generate PDF -----------------------------------------------------------
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(finalHtml, { waitUntil: "domcontentloaded", timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format:          "A4",
      printBackground: true,
      margin:          { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    await page.close();

    const safeClient = clientName.replace(/[^a-z0-9]/gi, "_").toUpperCase();
    const filename   = `Quotation_${firm.refPrefix}_${safeClient}_${dateStr.replace(/ /g, "")}.pdf`;

    res.setHeader("Content-Type",        "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length",      pdfBuffer.length);
    res.end(pdfBuffer);

  } catch (err) {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    console.error("PDF generation error:", err);
    return res.status(500).json({ message: "PDF generation failed", error: err.message });
  }
};



// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fms/quotations
// ─────────────────────────────────────────────────────────────────────────────
export const createQuotation = async (req, res) => {
  try {
    const { clientName, department, clientAddress, items, billing, firmName } = req.body;

    console.log("items: ", items);

    if (!clientName?.trim())
      return res.status(400).json({ message: "Client name is required." });
    if (!firmName || !VALID_FIRMS.has(firmName))
      return res.status(400).json({ message: `Invalid firm: "${firmName}"` });
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ message: "At least one item is required." });
    if (!items.every((i) => i.unit_rate != null && i.item_total != null))
      return res.status(400).json({ message: "All items must be fully calculated before saving." });

    const serverSubtotal = items.reduce((sum, i) => sum + Number(i.item_total || 0), 0);
    const { subtotal, discount, gstAmount, finalAmount } = computeBilling(
      serverSubtotal,
      billing?.discount || 0,
      billing?.gstPct   || null,
    );

    const quotation = await Quotation.create({
      firm_key:       firmName,
      year:           new Date().getFullYear(),
      client_name:    clientName.trim(),
      department:     department?.trim()    || null,
      client_address: clientAddress?.trim() || null,
      items,
      subtotal,
      discount:       Number(billing?.discount || 0),
      gst_percentage: billing?.gstPct ? Number(billing.gstPct) : null,
      gst_amount:     gstAmount,
      final_amount:   finalAmount,
      is_approved:    false,
      created_by_id:  req.user?.id || null,
    });

    return res.status(201).json({
      message:          "Quotation saved successfully.",
      quotation_ref_no: quotation.quotation_ref_no,
    });

  } catch (err) {
    console.error("createQuotation error:", err);
    return res.status(500).json({ message: err.message || "Failed to save quotation." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fms/quotations/:refNo/for-job
// ─────────────────────────────────────────────────────────────────────────────
export const getQuotationForJob = async (req, res) => {
  try {
    const refNo = Number(req.params.refNo);

    if (!refNo || !Number.isInteger(refNo) || refNo <= 0)
      return res.status(400).json({ message: "Invalid quotation reference number." });

    const quotation = await Quotation.findByPk(refNo);

    if (!quotation)
      return res.status(404).json({ message: `No quotation found with reference: ${refNo}` });

    // if (quotation.is_approved)
    //   return res.status(400).json({
    //     message: `Quotation #${refNo} has already been used to create a job card.`,
    //   });

    
    console.log("quotation: ", Number(quotation.gst_percentage));

    return res.json({
      quotation_ref_no: quotation.quotation_ref_no,
      firm_key:         quotation.firm_key,
      client_name:      quotation.client_name,
      department:       quotation.department,
      client_address:   quotation.client_address,
      items:            (() => {
                            const raw = quotation.items;
                            if (!raw) return [];
                            if (typeof raw === "string") {
                                try { return JSON.parse(raw); } catch { return []; }
                            }
                            return raw;
                        })(),
      billing: {
        subtotal:       Number(quotation.subtotal),
        discount:       Number(quotation.discount),
        gst_percentage: quotation.gst_percentage ?? "",
        gst_amount:     Number(quotation.gst_amount),
        final_amount:   Number(quotation.final_amount),
      },
    });

  } catch (err) {
    console.error("getQuotationForJob error:", err);
    return res.status(500).json({ message: "Failed to fetch quotation." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fms/quotations
// ─────────────────────────────────────────────────────────────────────────────
export const listQuotations = async (req, res) => {
  try {
    const { page = 1, limit = 50, firm, is_approved, year } = req.query;
    const where = {};
    if (firm)                    where.firm_key    = firm;
    if (year)                    where.year        = Number(year);
    if (is_approved !== undefined) where.is_approved = is_approved === "true";

    const { count, rows } = await Quotation.findAndCountAll({
      where,
      order:      [["quotation_ref_no", "DESC"]],
      limit:      Number(limit),
      offset:     (Number(page) - 1) * Number(limit),
      attributes: [
        "quotation_ref_no", "firm_key", "year",
        "client_name", "department",
        "subtotal", "discount", "gst_percentage", "final_amount",
        "is_approved", "created_by_id", "created_at",
      ],
    });

    return res.json({ total: count, data: rows });
  } catch (err) {
    console.error("listQuotations error:", err);
    return res.status(500).json({ message: "Failed to fetch quotations." });
  }
};