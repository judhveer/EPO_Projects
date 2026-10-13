// backend/src/utils/jobFms/productionEmailBuilder.js
//
// Pure functions only (no DB, no imports) — builds the plain email that the
// Production Coordinators receive:
//   kind "new"       → new order (create direct-to-production / client approved / marked direct)
//   kind "corrected" → job already with production was edited (changed values in red)
//   kind "withdrawn" → direct-to-production was unchecked, job went back to review

const RED = "#d00000";

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escMultiline = (v) => esc(v).replace(/\r?\n/g, "<br/>");

const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());
const asArray = (v) => (Array.isArray(v) ? v : []);

// 21/09/2026, 05:30 PM  (always Indian Standard Time)
export const formatDateTimeIST = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date
    .toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
};

/* ────────────────────────────────────────────────────────────────────────────
   1. ITEM VIEW — exactly what JobItemsSidebar (default mode) shows.
   Every row has a stable `key` so old vs new can be compared field by field.
──────────────────────────────────────────────────────────────────────────── */
export function buildItemView(item) {
  const isMultiple = item.category === "Multiple Sheet";
  const isWide = item.category === "Wide Format";
  const isSingle = item.category === "Single Sheet";

  const costing = item.costing || null;
  const insidePapers = asArray(item.inside_papers);
  const insideCosting = asArray(costing?.ms_inside_costing);
  const coverToPrint = item.cover_to_print !== false;

  const add = (list, key, label, value) => {
    const v = clean(value);
    if (v !== "") list.push({ key, label, value: v });
  };

  // ── Common rows ──
  const rows = [];
  add(rows, "name", "Item Name", item.enquiry_for || "-");
  add(rows, "size", "Size (Finished)", item.size);
  add(
    rows,
    "qty",
    "Quantity",
    item.quantity ? `${item.quantity} ${item.uom || ""}`.trim() : "",
  );
  if (!isMultiple) add(rows, "color", "Color Scheme", item.color_scheme);
  add(rows, "sides", "Sides", item.sides);

  const bindingTypes = asArray(item.binding_types);
  if (bindingTypes.length > 0) add(rows, "binding", "Binding", bindingTypes.join(", "));
  if (item.no_of_foldings > 0)
    add(rows, "folding", "Folding", `${item.no_of_foldings} fold(s) per copy`);
  if (item.no_of_creases > 0)
    add(rows, "creasing", "Creasing", `${item.no_of_creases} crease(s) per sheet`);

  // Numbering / Perforation targets (Multiple Sheet with 2+ inside papers)
  if (isMultiple && insidePapers.length >= 2 && item.binding_targets) {
    const paperRef = (pid) => {
      const idx = insidePapers.findIndex((p) => p._id === pid);
      if (idx === -1) return null;
      const p = insidePapers[idx];
      const c = insideCosting[idx] || {};
      const type = p.paper_type || c.paper_name;
      const gsm = p.paper_gsm || c.gsm;
      return [`Paper ${idx + 1}`, type, gsm ? `${gsm} GSM` : null]
        .filter(Boolean)
        .join(" — ");
    };
    const refs = (ids) => asArray(ids).map(paperRef).filter(Boolean).join(", ");

    if (bindingTypes.includes("Numbering"))
      add(rows, "numbering", "Numbering On", refs(item.binding_targets.numbering_paper_ids));
    if (bindingTypes.includes("Perforation"))
      add(rows, "perforation", "Perforation On", refs(item.binding_targets.perforation_paper_ids));
  }

  add(rows, "instr", "Item Instructions", item.item_instructions);

  // ── Header line for Multiple Sheet ──
  const insideHeader = isMultiple
    ? { key: "insideHeader", value: `INSIDE — ${item.inside_pages ?? "—"} PAGES FOR EACH PAPER` }
    : null;

  // ── Sections (boxes) ──
  const sections = [];

  if (isSingle) {
    const s = { key: "paper", title: "🧻 Paper Details", rows: [], notice: null };
    add(s.rows, "type", "Paper Type", item.selectedPaper?.paper_name);
    add(s.rows, "gsm", "GSM", item.selectedPaper?.gsm);
    add(s.rows, "sheet", "Sheet Size", item.selectedPaper?.size_name);
    add(s.rows, "press", "Press", item.press_type);
    sections.push(s);
  }

  if (isMultiple) {
    if (insideCosting.length > 0) {
      insideCosting.forEach((p, i) => {
        const label =
          [p.paper_name, p.gsm ? `${p.gsm} GSM` : null].filter(Boolean).join(" · ") ||
          `Paper ${i + 1}`;
        const s = {
          key: `inside:${i}`,
          title: `🗒 Inside Paper ${i + 1} — ${label}`,
          rows: [],
          notice: null,
        };
        add(s.rows, "sheet", "Sheet Size", p.size_name);
        add(s.rows, "dims", "Dimensions", p.sheet_dimensions);
        if (p.to_print) {
          add(s.rows, "color", "Color Scheme", p.color_scheme);
          add(s.rows, "press", "Press", p.press_type);
        } else {
          s.notice = "🚫 Not sent to press — paper cost only";
        }
        sections.push(s);
      });
    } else if (item.selectedPaper) {
      // legacy record (saved before multi-paper format)
      const s = { key: "inside:legacy", title: "🧻 Inside Paper", rows: [], notice: null };
      add(s.rows, "type", "Paper Type", item.selectedPaper.paper_name);
      add(s.rows, "gsm", "GSM", item.selectedPaper.gsm);
      add(s.rows, "sheet", "Sheet Size", item.selectedPaper.size_name);
      sections.push(s);
    }

    const cover = { key: "cover", title: "📘 Cover Paper", rows: [], notice: null };
    add(cover.rows, "type", "Paper Type", item.selectedCoverPaper?.paper_name);
    add(cover.rows, "gsm", "GSM", item.selectedCoverPaper?.gsm);
    add(cover.rows, "sheet", "Sheet Size", item.selectedCoverPaper?.size_name);
    add(cover.rows, "pages", "Cover Pages", item.cover_pages);
    if (coverToPrint) {
      add(cover.rows, "color", "Color Scheme", item.cover_color_scheme);
      add(cover.rows, "press", "Press", item.cover_press_type);
    } else {
      cover.notice = "🚫 Cover not sent to press — paper cost only";
    }
    sections.push(cover);
  }

  if (isWide) {
    const w = { key: "wide", title: "🖼 Wide Format Material", rows: [], notice: null };
    const m = item.selectedWideMaterial;
    add(w.rows, "material", "Material", m?.material_name);
    add(w.rows, "gsm", "GSM", m?.gsm);
    if (m?.thickness_mm) add(w.rows, "thickness", "Thickness", `${m.thickness_mm} mm`);
    if (m?.board_width_ft)
      add(w.rows, "board", "Board Size", `${m.board_width_ft} × ${m.board_height_ft} ft`);
    sections.push(w);
  }

  return { id: item.id, category: item.category || "", rows, insideHeader, sections };
}

/* ────────────────────────────────────────────────────────────────────────────
   2. DIFF — mark what changed between the old and the new view of an item.
──────────────────────────────────────────────────────────────────────────── */
function annotateItem(view, oldView, markAll = false) {
  const has = !!oldView;
  const oldRows = new Map((oldView?.rows || []).map((r) => [r.key, r]));
  const newRowKeys = new Set(view.rows.map((r) => r.key));
  const oldSecs = new Map((oldView?.sections || []).map((s) => [s.key, s]));
  const newSecKeys = new Set(view.sections.map((s) => s.key));

  return {
    ...view,
    isNew: markAll,
    categoryChanged: markAll || (has && oldView.category !== view.category),
    rows: view.rows.map((r) => ({
      ...r,
      changed: markAll || (has && oldRows.get(r.key)?.value !== r.value),
    })),
    removedRows: has ? oldView.rows.filter((r) => !newRowKeys.has(r.key)) : [],
    insideHeader: view.insideHeader && {
      ...view.insideHeader,
      changed: markAll || (has && oldView.insideHeader?.value !== view.insideHeader.value),
    },
    sections: view.sections.map((s) => {
      const os = oldSecs.get(s.key);
      const secNew = markAll || (has && !os);
      const oldSecRows = new Map((os?.rows || []).map((r) => [r.key, r]));
      const newSecRowKeys = new Set(s.rows.map((r) => r.key));
      return {
        ...s,
        titleChanged: secNew || (!!os && os.title !== s.title),
        noticeChanged: secNew || (!!os && os.notice !== s.notice),
        rows: s.rows.map((r) => ({
          ...r,
          changed: secNew || (!!os && oldSecRows.get(r.key)?.value !== r.value),
        })),
        removedRows: os ? os.rows.filter((r) => !newSecRowKeys.has(r.key)) : [],
      };
    }),
    removedSections: has ? oldView.sections.filter((s) => !newSecKeys.has(s.key)) : [],
  };
}

const itemHasChanges = (a) =>
  a.isNew ||
  a.categoryChanged ||
  a.rows.some((r) => r.changed) ||
  a.removedRows.length > 0 ||
  !!a.insideHeader?.changed ||
  a.removedSections.length > 0 ||
  a.sections.some(
    (s) =>
      s.titleChanged ||
      s.noticeChanged ||
      s.rows.some((r) => r.changed) ||
      s.removedRows.length > 0,
  );

export function diffItems(oldItems, newItems) {
  const oldViews = asArray(oldItems).map(buildItemView);
  const newViews = asArray(newItems).map(buildItemView);
  const oldMap = new Map(oldViews.map((v) => [v.id, v]));
  const newIds = new Set(newViews.map((v) => v.id));

  const annotated = newViews.map((v) =>
    oldMap.has(v.id) ? annotateItem(v, oldMap.get(v.id)) : annotateItem(v, null, true),
  );
  const removed = oldViews.filter((v) => !newIds.has(v.id));

  return {
    annotated,
    removed,
    changed: removed.length > 0 || annotated.some(itemHasChanges),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   3. HTML RENDER — plain, no logo, no links, no attachments.
──────────────────────────────────────────────────────────────────────────── */
const red = (text) => `<span style="color:${RED};font-weight:bold">${text}</span>`;
const val = (text, changed) => (changed ? red(escMultiline(text)) : escMultiline(text));

const rowsTable = (rows, removedRows = []) => {
  const tr = (label, valueHtml) =>
    `<tr>
      <td style="padding:1px 14px 1px 0;vertical-align:top;white-space:nowrap;width:150px">${esc(label)}:</td>
      <td style="padding:1px 0;vertical-align:top">${valueHtml}</td>
    </tr>`;
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">
    ${rows.map((r) => tr(r.label, val(r.value, r.changed))).join("")}
    ${removedRows.map((r) => tr(r.label, red("—"))).join("")}
  </table>`;
};

const renderSection = (s) => `
  <div style="border:1px solid #888;border-radius:8px;padding:8px 12px;margin:10px 0;font-size:15px">
    <div style="font-weight:bold;margin-bottom:4px">${val(s.title, s.titleChanged)}</div>
    ${rowsTable(s.rows, s.removedRows)}
    ${s.notice ? `<div style="margin-top:4px">${val(s.notice, s.noticeChanged)}</div>` : ""}
  </div>`;

const renderItem = (a, index) => `
  <div style="margin-top:22px">
    <div style="font-size:17px">
      <b>Item ${index + 1}:</b> ${val(a.category, a.categoryChanged && !a.isNew)}
      ${a.isNew ? " " + red("NEW ITEM") : ""}
    </div>
    ${rowsTable(a.rows, a.removedRows)}
    ${a.insideHeader ? `<div style="margin-top:6px;font-size:15px">${val(a.insideHeader.value, a.insideHeader.changed)}</div>` : ""}
    ${a.sections.map(renderSection).join("")}
    ${a.removedSections
      .map((s) => `<div style="margin:6px 0;font-size:15px">${red("REMOVED: " + esc(s.title))}</div>`)
      .join("")}
  </div>`;

const headerBlock = (job, changed = {}) => {
  const line = (label, value, isChanged) => `
    <div style="font-size:17px">${esc(label)}: ${isChanged ? red(esc(value)) : esc(value)}</div>`;
  return `
    ${line("Job No", job.job_no, false)}
    ${line("Client Name", job.client_name || "—", changed.client_name)}
    ${line("Delivery Date", formatDateTimeIST(job.delivery_date), changed.delivery_date)}
    ${line("CRM", job.order_handled_by || "—", changed.order_handled_by)}
    ${line("Designer", job.assigned_designer || "Direct to Production", false)}`;
};

const wrap = (inner) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;max-width:720px">${inner}</div>`;

/**
 * @param kind          "new" | "corrected" | "withdrawn"
 * @param job           plain JobCard object (current DB state)
 * @param items         current items (raw JSON, already loaded with paper + costing)
 * @param oldItems      items BEFORE the edit (only for "corrected")
 * @param headerChanged { client_name, delivery_date, order_handled_by } booleans
 * @returns { subject, html } or null when there is nothing to send
 */
export function buildProductionEmail({
  kind,
  job,
  items = [],
  oldItems = [],
  headerChanged = {},
}) {
  const base = `Job No: ${job.job_no} | Delivery Date: ${formatDateTimeIST(job.delivery_date)} | CRM: ${job.order_handled_by || "—"}`;

  if (kind === "withdrawn") {
    return {
      subject: `Job No: ${job.job_no} | JOB WITHDRAWN - Do Not Start | ${job.client_name}`,
      html: wrap(`
        <div style="font-size:18px;margin-bottom:10px">${red("JOB WITHDRAWN — please do not start / stop work on this job.")}</div>
        <div style="margin-bottom:12px;font-size:15px">This job has been sent back to Coordinator Review. You will get a new mail when it is ready for production again.</div>
        ${headerBlock(job)}`),
    };
  }

  if (kind === "corrected") {
    const { annotated, removed, changed } = diffItems(oldItems, items);
    if (!changed && !headerChanged.delivery_date) return null; // nothing production cares about

    return {
      subject: `${base} (Corrected Details)`,
      html: wrap(`
        <div style="font-size:15px;margin-bottom:10px">${red("CORRECTED DETAILS")} — changed values are shown in red.</div>
        ${headerBlock(job, headerChanged)}
        ${annotated.map(renderItem).join("")}
        ${removed
          .map((v) => {
            const name = v.rows.find((r) => r.key === "name")?.value || "(unnamed)";
            return `<div style="margin-top:18px;font-size:16px">${red(`REMOVED ITEM: ${esc(name)} (${esc(v.category)})`)}</div>`;
          })
          .join("")}`),
    };
  }

  // kind === "new"
  const annotated = asArray(items).map((it) => annotateItem(buildItemView(it), null, false));
  return {
    subject: base,
    html: wrap(`
      ${headerBlock(job)}
      ${annotated.map(renderItem).join("")}`),
  };
}