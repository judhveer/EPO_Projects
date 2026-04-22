// controllers/jobCardDownload.controller.js
import puppeteer from "puppeteer";
import path      from "path";
import fs        from "fs";
import { fileURLToPath } from "url";

import db from '../../models/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Reuse browser singleton if quotation controller is loaded ────────────────
// If not, maintain our own. Import whichever is available.
let _browser = null;
async function getBrowser() {
  if (_browser?.isConnected()) return _browser;
  _browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  _browser.on("disconnected", () => { _browser = null; });
  return _browser;
}

// ── Date formatter ──────────────────────────────────────────────────────────
const fmtDate = (iso, withTime = false) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const opts = withTime
      ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }
      : { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" };
    return d.toLocaleDateString("en-IN", opts);
  } catch { return "—"; }
};

const esc = (str) =>
  String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── Checkbox helper ──────────────────────────────────────────────────────────
const chk = (checked) =>
  `<span class="checkbox${checked ? " checked" : ""}">${checked ? "✓" : ""}</span>`;

// ── INR formatter ─────────────────────────────────────────────────────────────
const inr = (n) =>
  n != null ? `₹ ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—";

// ── Build HTML for a single item page ────────────────────────────────────────
function buildItemPage(job, item, idx, total) {
  const cat = item.category || "";
  const isSS = cat === "Single Sheet";
  const isMS = cat === "Multiple Sheet";
  const isWF = cat === "Wide Format";
  const isOther = cat === "Other";


  // ── Color scheme label ──────────────────────────────────────
  const bwLabel = (scheme) => {
    if (!scheme) return "";
    return scheme.toLowerCase().includes("black") ? "B/W" : "Multicolor";
  };

  // ── Build inside papers table (Multiple Sheet) ─────────────
  let insidePapersHtml = "";
  if (isMS && (item.inside_papers || []).length > 0) {
    const numberingIds = new Set(item.binding_targets?.numbering_paper_ids || []);
    const perforationIds = new Set(item.binding_targets?.perforation_paper_ids || []);

    const getBindingLabel = (paperId) => {
      const labels = [];
      if (numberingIds.has(paperId)) labels.push("Numbering");
      if (perforationIds.has(paperId)) labels.push("Perforation");
      return labels.length ? labels.join(" / ") : "";
    };

    const rows = (item.inside_papers || []).map((p, pIdx) => `
      <tr>
        <td>${pIdx + 1}</td>
        <td style="text-align:left">${esc(p.paper_type || "—")}
          <div style="font-size:7px;color:#6b7280;margin-top:1px">
            ${esc(getBindingLabel(p._id))}
          </div>
        </td>
        <td>${esc(p.paper_gsm ? p.paper_gsm + " GSM" : "—")}</td>
        <td>${p.to_print ? "Yes" : "No"}</td>
        <td>${esc(bwLabel(p.color_scheme) || "—")}</td>
        <td>${esc(p.press_type || "—")}</td>
      </tr>`).join("");

    insidePapersHtml = `
      <div class="field-label" style="margin-bottom:3px">Inside Papers:</div>
      <table class="papers-table">
        <thead>
          <tr>
            <th>#</th><th style="text-align:left">Paper Type</th><th>GSM</th>
            <th>Print</th><th>Color</th><th>Press</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Binding tags ──────────────────────────────────────────
  const bindingTypes = item.binding_types || [];

  const hasCreasing = bindingTypes.includes("Creasing");
  const hasFolding = bindingTypes.includes("Folding");

  const bindingHtml = `
    ${bindingTypes.length > 0
      ? `<div class="binding-tags">
          ${bindingTypes.map(b => `<span class="binding-tag">${esc(b)}</span>`).join("")}
        </div>`
      : `<span style="color:#9ca3af;font-size:8px">None</span>`
    }

    ${isSS && hasCreasing ? `
        <div class="field-row">
          <span class="field-label">No. of Crease</span><span class="field-colon">:</span>
          <span class="field-value">${esc(item.no_of_creases || "—")}</span>
        </div>
      ` : ""}

      ${isSS && hasFolding ? `
        <div class="field-row">
          <span class="field-label">No. of Folds</span><span class="field-colon">:</span>
          <span class="field-value">${esc(item.no_of_foldings || "—")}</span>
        </div>
      ` : ""}
  `;

  // ── Wide format details ───────────────────────────────────
  let wideHtml = "";
  if (isWF) {
    wideHtml = `
      <div class="field-row">
        <span class="field-label">Material</span><span class="field-colon">:</span>
        <span class="field-value blue">${esc(item.wide_material_name || "—")}</span>
      </div>
      ${item.wide_material_gsm ? `<div class="field-row"><span class="field-label">GSM</span><span class="field-colon">:</span><span class="field-value">${esc(item.wide_material_gsm)}</span></div>` : ""}
      ${item.wide_material_thickness ? `<div class="field-row"><span class="field-label">Thickness</span><span class="field-colon">:</span><span class="field-value">${esc(item.wide_material_thickness)} mm</span></div>` : ""}`;
  }

  // ── Item instructions ─────────────────────────────────────
  const instrHtml = (item.item_instructions || "")
    ? `<div class="special-box">⚡ ${esc(item.item_instructions)}</div>`
    : `<div class="special-box" style="color:#9ca3af;font-size:8px">—</div>`;

  // ── Costing snapshot ──────────────────────────────────────
  const cs = item.costing || {};
  const unitRate = item.unit_rate || cs.unit_rate;
  const itemTotal = item.item_total || cs.item_total;
  const showCost = unitRate && itemTotal;

  const costHtml = showCost ? `
    <div class="cost-box">
      <div class="cost-row"><span class="cost-label">Unit Rate</span><span class="cost-value">${inr(unitRate)}</span></div>
      <div class="cost-row"><span class="cost-label">Qty × Rate</span><span class="cost-value">${esc(item.quantity || "?")} × ${inr(unitRate)}</span></div>
      <div class="cost-row"><span class="cost-label">Item Total</span><span class="cost-value">${inr(itemTotal)}</span></div>
    </div>` : "";

  // ── Priority badge ────────────────────────────────────────
  const prio = job.task_priority || "Medium";
  const prioBadge = `<span class="priority-badge priority-${prio}">${esc(prio)}</span>`;

  return `
<div class="job-card-page">

  <!-- TOP HEADER -->
  <div class="top-header">
    <div>
      <div class="firm-name">Eastern Panorama Offset</div>
      <div class="firm-tagline">Quality Guaranteed &nbsp;|&nbsp; 2nd Floor, RPG Complex, Keating Road, Shillong</div>
    </div>
    <div class="job-badge">
      <div class="job-no">Job #${esc(job.job_no)}</div>
      <div class="job-date">Created: ${fmtDate(job.createdAt || job.created_at, true)}</div>
    </div>
  </div>

  <!-- JOB META BAR -->
  <div class="meta-bar">
    <div class="meta-cell">
      <div class="meta-label">Client Name</div>
      <div class="meta-value highlight">${esc(job.client_name)}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Delivery Date</div>
      <div class="meta-value red">${fmtDate(job.delivery_date, true)}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Priority</div>
      <div class="meta-value">${prioBadge}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Execution</div>
      <div class="meta-value">${esc(job.execution_location || "—")}</div>
    </div>
    <div class="meta-cell wide">
      <div class="meta-label">Order Handled By</div>
      <div class="meta-value">${esc(job.order_handled_by || "—")}</div>
    </div>
    <div class="meta-cell wide">
      <div class="meta-label">Delivery Location</div>
      <div class="meta-value">${esc((job.delivery_location || "").replace(/_/g, " "))}</div>
      <div class="meta-value">${esc((job.delivery_address || "").replace(/_/g, " "))}</div>
    </div>
    ${job.proof_date ? `
    <div class="meta-cell wide">
      <div class="meta-label">Proof Date</div>
      <div class="meta-value">${fmtDate(job.proof_date)}</div>
    </div>` : ""}
    ${job.instructions ? `
    <div class="meta-cell full">
      <div class="meta-label">Job Instructions</div>
      <div class="meta-value" style="font-weight:600;color:#92400e">${esc(job.instructions)}</div>
    </div>` : ""}
  </div>

  <!-- ITEM BADGE -->
  <div class="item-badge">
    <span>Item ${idx + 1} of ${total} &nbsp;|&nbsp; ${esc(cat)}</span>
    <span class="item-name">${esc(item.enquiry_for || "—")}</span>
  </div>

  <!-- TWO-COLUMN BODY -->
  <div class="card-body">

    <!-- ══ LEFT: PRINTING SECTION ══════════════════════════════ -->
    <div class="section">
      <div class="section-title">Printing Section</div>

      <!-- Item + Size + Qty -->
      <div class="field-row">
        <span class="field-label">Item</span><span class="field-colon">:</span>
        <span class="field-value blue">${esc(item.enquiry_for || "—")}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Size</span><span class="field-colon">:</span>
        <span class="field-value">${esc(item.size || "—")}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Quantity</span><span class="field-colon">:</span>
        <span class="field-value">${esc(item.quantity || "—")} ${esc(item.uom || "")}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Sides</span><span class="field-colon">:</span>
        <span class="field-value">${esc(item.sides || "—")}</span>
      </div>

      <!-- Single Sheet paper -->
      ${isSS ? `
      <div style="margin-bottom:4px">
        <div class="field-label" style="margin-bottom:3px">Paper:</div>
        <div class="field-grid">
          <span class="fg-label">Type</span>
          <span class="fg-value">${esc(item.paper_type || "—")}</span>
          <span class="fg-label">GSM</span>
          <span class="fg-value">${esc(item.paper_gsm ? item.paper_gsm + " GSM" : "—")}</span>
          <span class="fg-label">Color</span>
          <span class="fg-value">${esc(bwLabel(item.color_scheme) || "—")}</span>
          <span class="fg-label">Press</span>
          <span class="fg-value">${esc(item.press_type || "—")}</span>
        </div>
      </div>` : ""}

      <!-- Multiple Sheet papers -->
      ${isMS ? `
      <div style="margin-bottom:4px">
        ${insidePapersHtml}
        <div class="field-row" style="margin-top:3px">
          <span class="field-label">No. of Pages</span><span class="field-colon">:</span>
          <span class="field-value">${esc(item.inside_pages || "—")}</span>
        </div>
        <div style="margin-top:3px">
          <div class="field-label" style="margin-bottom:2px">Cover Paper:</div>
          <div class="field-grid">
            <span class="fg-label">Type</span>
            <span class="fg-value">${esc(item.cover_paper_type || "—")}</span>
            <span class="fg-label">GSM</span>
            <span class="fg-value">${esc(item.cover_paper_gsm ? item.cover_paper_gsm + " GSM" : "—")}</span>
            <span class="fg-label">Pages</span>
            <span class="fg-value">${esc(item.cover_pages || "—")}</span>
            <span class="fg-label">Print</span>
            <span class="fg-value">${item.cover_to_print !== false ? "Yes" : "No"}</span>
            ${item.cover_to_print !== false ? `
            <span class="fg-label">Color</span>
            <span class="fg-value">${esc(bwLabel(item.cover_color_scheme) || "—")}</span>
            <span class="fg-label">Press</span>
            <span class="fg-value">${esc(item.cover_press_type || "—")}</span>` : ""}
          </div>
        </div>
      </div>` : ""}

      <!-- Wide Format -->
      ${isWF ? wideHtml : ""}

      <!-- Other -->
      ${isOther ? `<div class="field-row"><span class="field-label">Category</span><span class="field-colon">:</span><span class="field-value">Other</span></div>` : ""}

      <!-- Binding -->
      <div style="margin-bottom:4px">
        <div class="field-label" style="margin-bottom:3px">Binding / Finishing:</div>
        ${bindingHtml}
      </div>

      <!-- Special Instruction -->
      <div>
        <div class="field-label" style="margin-bottom:2px">Special Instruction:</div>
        ${instrHtml}
      </div>

      <!-- Cost -->
      ${costHtml}
    </div>

    <!-- DIVIDER -->
    <div class="divider-line"></div>

    <!-- ══ RIGHT: COMPUTER SECTION ═════════════════════════════ -->
    <div class="section">
      <div class="section-title">Computer Section</div>

      <div class="field-row">
        <span class="field-label">Job No.</span><span class="field-colon">:</span>
        <span class="field-value blue">${esc(job.job_no)}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Date</span><span class="field-colon">:</span>
        <span class="field-value">${fmtDate(job.createdAt || job.created_at)}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Item Type</span><span class="field-colon">:</span>
        <span class="field-value">${esc(item.enquiry_for || "—")}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Size</span><span class="field-colon">:</span>
        <span class="field-value">${esc(item.size || "—")}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Delivery Date</span><span class="field-colon">:</span>
        <span class="field-value red">${fmtDate(job.delivery_date, true)}</span>
      </div>
      <div class="field-row">
        <span class="field-label">1st Proof Date</span><span class="field-colon">:</span>
        <span class="field-value">${fmtDate(job.proof_date) || ""}&nbsp;</span>
      </div>
      <div class="field-row">
        <span class="field-label">Proof Final On</span><span class="field-colon">:</span>
        <span class="field-value">&nbsp;</span>
      </div>

      <!-- Immediate attention -->
      <div class="approval-row" style="margin-top:5px;padding-top:5px;border-top:1px solid #e2e8f0">
        ${chk(prio === "Urgent")}
        <span style="font-weight:700;color:${prio === "Urgent" ? "#dc2626" : "#374151"}">Immediate Attention Matter</span>
      </div>

      <!-- Operator section -->
      <div style="margin-top:6px;padding-top:4px;border-top:1.5px solid #1a3a6e">
        <div style="font-size:8.5px;font-weight:800;color:#1a3a6e;margin-bottom:5px">TO BE FILLED BY OPERATOR</div>

        <div class="operator-field">
          <div class="operator-label">1st Proof Given :</div>
          <div class="operator-line"></div>
        </div>
        <div class="operator-field">
          <div class="operator-label">Proof Finalised On :</div>
          <div class="operator-line"></div>
        </div>

        <div class="approval-row">
          <span style="font-size:8px;font-weight:600">Proof Approved by:</span>
          <span>${chk(false)}</span><span style="font-size:8px">Email</span>
          <span>${chk(false)}</span><span style="font-size:8px">Person</span>
        </div>

        <div class="operator-field">
          <div class="operator-label">Whether Signature Taken :</div>
          <div class="operator-line"></div>
        </div>

        <div class="operator-field">
          <div class="operator-label">Proof Approved By :</div>
          <div class="operator-line"></div>
        </div>

        <div class="operator-field">
          <div class="operator-label">Remarks :</div>
          <div class="operator-line"></div>
          <div class="operator-line" style="margin-top:4px"></div>
        </div>
      </div>

      <!-- Signature -->
      <div class="signature-area">
        <div class="signature-line"></div>
        <div class="signature-label">Authorised Signatory</div>
      </div>
    </div>

  </div><!-- /card-body -->

  <!-- BOTTOM FOOTER -->
  <div class="card-footer">
    <span><strong>Job #${esc(job.job_no)}</strong> &nbsp;|&nbsp; ${esc(job.client_name)} &nbsp;|&nbsp; Item ${idx + 1}/${total}</span>
    <span>Printed: ${fmtDate(new Date().toISOString(), true)}</span>
  </div>

</div>`;
}

// ── Main controller ────────────────────────────────────────────────────────────
export const downloadJobCard = async (req, res) => {
  const { job_no } = req.params;

  try {
    // ── Fetch job with all items ─────────────────────────────────────────────
    // Using the same include pattern as your existing job-fetch endpoint.
    // Adjust the import/model access to match your project structure.
    const { JobCard, JobItem, PaperMaster, WideFormatMaterial } = db;

    const job = await JobCard.findByPk(job_no, {
      include: [
        {
          model:      JobItem,
          as:         "items",
          include: [
            { model: PaperMaster, as: "selectedPaper",      required: false },
            { model: PaperMaster, as: "selectedCoverPaper", required: false },
            { model: WideFormatMaterial, as: "selectedWideMaterial", required: false },
          ],
        },
      ],
    });


    if (!job) {
      return res.status(404).json({ message: `Job #${job_no} not found` });
    }

    const jobData  = job.toJSON();
    const items    = jobData.items || [];

    if (items.length === 0) {
      return res.status(400).json({ message: "Job has no items to print" });
    }

    // ── Rebuild item fields from associations ────────────────────────────────
    // Mirror what the frontend mapJobToForm does.
    const normalizedItems = items.map((item) => ({
      ...item,
      paper_type:       item.selectedPaper?.paper_name       || item.paper_type || "",
      paper_gsm:        item.selectedPaper?.gsm               || item.paper_gsm || "",
      cover_paper_type: item.selectedCoverPaper?.paper_name   || item.cover_paper_type || "",
      cover_paper_gsm:  item.selectedCoverPaper?.gsm          || item.cover_paper_gsm || "",
      binding_types:    Array.isArray(item.binding_types) ? item.binding_types : [],
      inside_papers:    Array.isArray(item.inside_papers) ? item.inside_papers : [],
      cover_to_print:   item.cover_to_print !== false,
      wide_material_name: item.selectedWideMaterial?.material_name || "",
      wide_material_gsm: item.selectedWideMaterial?.gsm || "",
      wide_material_thickness: item.selectedWideMaterial?.thickness || "",
      binding_targets: item.binding_targets && typeof item.binding_targets === "object"
        ? item.binding_targets
        : { numbering_paper_ids: [], perforation_paper_ids: [] },
    }));

    // ── Load template ────────────────────────────────────────────────────────
    const tplPath = path.resolve(__dirname, "../../templates/JobFMS/jobcard.html");
    if (!fs.existsSync(tplPath)) {
      return res.status(500).json({ message: "Job card template not found at " + tplPath });
    }
    const tpl = fs.readFileSync(tplPath, "utf-8");

    // ── Build one page per item ───────────────────────────────────────────────
    const pages = normalizedItems
      .map((item, idx) => buildItemPage(jobData, item, idx, normalizedItems.length))
      .join("\n");

    const finalHtml = tpl.replace("{{PAGES}}", pages);

    // ── Puppeteer render ─────────────────────────────────────────────────────
    const browser = await getBrowser();
    const page    = await browser.newPage();

    await page.setContent(finalHtml, { waitUntil: "domcontentloaded", timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format:          "A4",
      printBackground: true,
      margin:          { top: "4mm", right: "4mm", bottom: "4mm", left: "4mm" },
    });

    await page.close();

    // ── Stream response ───────────────────────────────────────────────────────
    const filename = `JobCard_${job_no}_${job.client_name.replace(/[^a-z0-9]/gi, "_").toUpperCase()}.pdf`;

    res.setHeader("Content-Type",        "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length",      pdfBuffer.length);
    res.end(pdfBuffer);

  } catch (err) {
    console.error("downloadJobCard error:", err);
    return res.status(500).json({ message: "Failed to generate job card PDF", error: err.message });
  }
};