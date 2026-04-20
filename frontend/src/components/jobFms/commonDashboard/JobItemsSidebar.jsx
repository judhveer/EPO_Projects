import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import api from "../../../lib/api";

// ── Shared micro-components ──

function Row({ label, value, truncate = false }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 text-sm">
      <span className="font-medium text-slate-500 shrink-0 min-w-[150px]">
        {label}:
      </span>
      <span
        className={`text-slate-800 ${truncate ? "truncate max-w-xs" : "break-words"}`}
        title={truncate ? String(value) : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function CostRow({ label, value }) {
  if (value == null || Number(value) === 0) return null;
  return (
    <div className="flex justify-between items-center text-xs bg-white border border-slate-100 rounded px-2.5 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700">
        ₹{Number(value).toFixed(2)}
      </span>
    </div>
  );
}

function Section({ title, children, accent = "slate" }) {
  const styles = {
    slate: "border-slate-200  bg-slate-50",
    blue: "border-blue-100   bg-blue-50",
    indigo: "border-indigo-100 bg-indigo-50",
    purple: "border-purple-100 bg-purple-50",
    green: "border-green-100  bg-green-50",
    amber: "border-amber-100  bg-amber-50",
  };
  return (
    <div
      className={`border rounded-lg p-3 space-y-2 ${styles[accent] ?? styles.slate}`}
    >
      <h6 className="font-semibold text-gray-700 text-sm">{title}</h6>
      {children}
    </div>
  );
}

// ── Item Card ──

function ItemCard({ item, index, viewMode }) {
  const isMultiple = item.category === "Multiple Sheet";
  const isWide = item.category === "Wide Format";
  const isSingle = item.category === "Single Sheet";
  const costing = item.costing; // JobItemCosting row (may be null for old records)
  // cover_to_print: default true for records saved before this field existed
  const coverToPrint = item.cover_to_print !== false;

  return (
    <div className="border rounded-xl p-4 shadow-sm bg-slate-50 space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h4 className="font-semibold text-blue-700">
          Item {index + 1}:{" "}
          <span className="text-slate-500 font-normal">{item.category}</span>
        </h4>
        {/* <span
          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded capitalize truncate max-w-[220px]"
          title={item.enquiry_for}
        >
          {item.enquiry_for || "—"}
        </span> */}
      </div>

      {/* ── Common fields ── */}
      <div className="space-y-1.5">
        <Row label="Item Name" value={item.enquiry_for ? item.enquiry_for : "-"} />


        <Row label="Size (Finished)" value={item.size} />
        <Row
          label="Quantity"
          value={
            item.quantity ? `${item.quantity} ${item.uom || ""}`.trim() : null
          }
        />
        {!isMultiple && <Row label="Color Scheme" value={item.color_scheme} />}
        <Row label="Sides" value={item.sides} />
        {item.binding_types?.length > 0 && (
          <Row label="Binding" value={item.binding_types.join(", ")} />
        )}
        {item.no_of_foldings > 0 && (
          <Row
            label="Folding"
            value={`${item.no_of_foldings} fold(s) per copy`}
          />
        )}
        {item.no_of_creases > 0 && (
          <Row
            label="Creasing"
            value={`${item.no_of_creases} crease(s) per sheet`}
          />
        )}
        {/* Binding targets — shown for Multiple Sheet with 2+ papers */}
        {isMultiple &&
          Array.isArray(item.inside_papers) &&
          item.inside_papers.length >= 2 &&
          item.binding_targets && (
            <div className="space-y-1">
              {item.binding_types?.includes("Numbering") &&
                (item.binding_targets.numbering_paper_ids || []).length > 0 && (
                  <Row
                    label="Numbering On"
                    value={item.binding_targets.numbering_paper_ids
                      .map((pid) => {
                        const idx = item.inside_papers.findIndex(
                          (p) => p._id === pid,
                        );
                        const paper = item.inside_papers[idx];
                        return idx === -1
                          ? pid
                          : [
                              `Paper ${idx + 1}`,
                              paper?.paper_type,
                              paper?.paper_gsm
                                ? `${paper.paper_gsm} GSM`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" — ");
                      })
                      .join(", ")}
                  />
                )}

              {item.binding_types?.includes("Perforation") &&
                (item.binding_targets.perforation_paper_ids || []).length >
                  0 && (
                  <Row
                    label="Perforation On"
                    value={item.binding_targets.perforation_paper_ids
                      .map((pid) => {
                        const idx = item.inside_papers.findIndex(
                          (p) => p._id === pid,
                        );
                        const paper = item.inside_papers[idx];
                        return idx === -1
                          ? pid
                          : [
                              `Paper ${idx + 1}`,
                              paper?.paper_type,
                              paper?.paper_gsm
                                ? `${paper.paper_gsm} GSM`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" — ");
                      })
                      .join(", ")}
                  />
                )}
            </div>
          )}

          {item.item_instructions && (
            <Row label="Item Instructions" value={item.item_instructions} />
          )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SINGLE SHEET
      ══════════════════════════════════════════════════════════════════════ */}
      {isSingle && (
        <Section title="🧻 Paper Details" accent="blue">
          {/* Paper identity from FK join */}
          <Row
            label="Paper Type"
            value={
              item.selectedPaper?.paper_name || costing?.ssPaper?.paper_name
            }
          />
          <Row
            label="GSM"
            value={item.selectedPaper?.gsm || costing?.ssPaper?.gsm}
          />
          <Row
            label="Sheet Size"
            value={item.selectedPaper?.size_name || costing?.ssPaper?.size_name}
          />
          <Row label="Press" value={item.press_type} />

          {/* Calc data from JobItemCosting */}
          {costing && (
            <>
              {viewMode === "account" && (
                <Row label="UPS" value={costing.ss_ups} />
              )}

              {/* If Outbound Dashboard then show these fields */}
              {viewMode === "outbound" && (
                <>
                  <Row label="Sheets (net)" value={costing.ss_sheets} />
                  <Row
                    label="Sheets + Wastage"
                    value={costing.ss_sheets_with_wastage}
                  />
                </>
              )}

              {/* If Accountant Dashboard then show these fields */}
              {viewMode === "account" && (
                <>
                  <Row
                    label="Rate / Sheet"
                    value={
                      costing.ss_sheet_rate ? `₹${costing.ss_sheet_rate}` : null
                    }
                  />
                  <div className="mt-2 space-y-1">
                    <CostRow label="Sheet Cost" value={costing.ss_sheet_cost} />
                    <CostRow
                      label="Printing Cost"
                      value={costing.ss_printing_cost}
                    />
                    <CostRow
                      label="Binding Cost"
                      value={costing.binding_cost}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MULTIPLE SHEET — Inside Papers
      ══════════════════════════════════════════════════════════════════ */}
      {isMultiple && (
        <>
          {/* Inside pages header — always show for Multiple Sheet */}
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Inside —{" "}
            <span className="text-slate-700 font-semibold">
              {item.inside_pages ?? "—"}
            </span>{" "}
            pages For Each Paper
          </div>

          {/* Per-paper breakdown from costing */}
          {costing?.ms_inside_costing?.length > 0 ? (
            <div className="space-y-3">
              {costing.ms_inside_costing.map((p, pIdx) => {
                const paperLabel =
                  [p.paper_name, p.gsm ? `${p.gsm} GSM` : null]
                    .filter(Boolean)
                    .join(" · ") || `Paper ${pIdx + 1}`;

                return (
                  <Section
                    key={pIdx}
                    title={`🗒 Inside Paper ${pIdx + 1} — ${paperLabel}`}
                    accent="blue"
                  >
                    <Row label="Sheet Size" value={p.size_name} />
                    <Row label="Dimensions" value={p.sheet_dimensions} />

                    {viewMode === "account" && (
                      <>
                        <Row label="UPS (raw)" value={p.ups} />
                        <Row label="Effective UPS" value={p.effective_ups} />
                      </>
                    )}

                    {viewMode === "outbound" && (
                      <>
                        <Row label="Sheets" value={p.sheets} />
                        <Row
                          label="With Wastage"
                          value={p.sheets_with_wastage}
                        />
                      </>
                    )}

                    {viewMode === "account" && (
                      <Row
                        label="Rate / Sheet"
                        value={p.sheet_rate ? `₹${p.sheet_rate}` : null}
                      />
                    )}

                    {/* ── Print indicator ── */}
                    {p.to_print ? (
                      <>
                        <Row label="Color Scheme" value={p.color_scheme} />
                        <Row label="Press" value={p.press_type} />

                        {viewMode === "account" && (
                          <div className="mt-1 space-y-1">
                            <CostRow label="Sheet Cost" value={p.sheet_cost} />
                            <CostRow
                              label="Printing Cost"
                              value={p.printing_cost}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
                          <span>🚫</span>
                          <span>Not sent to press — paper cost only</span>
                        </div>
                        {viewMode === "account" && (
                          <div className="mt-1 space-y-1">
                            <CostRow label="Sheet Cost" value={p.sheet_cost} />
                          </div>
                        )}
                      </>
                    )}
                  </Section>
                );
              })}
            </div>
          ) : item.selectedPaper ? (
            /* Legacy record — costing not yet calculated */
            <Section title="🧻 Inside Paper (legacy)" accent="amber">
              <p className="text-xs text-amber-600 mb-1">
                Saved before multi-paper format. Recalculate to see full
                breakdown.
              </p>
              <Row label="Paper Type" value={item.selectedPaper.paper_name} />
              <Row label="GSM" value={item.selectedPaper.gsm} />
              <Row label="Sheet Size" value={item.selectedPaper.size_name} />
            </Section>
          ) : (
            <p className="text-xs text-slate-400 italic">
              No costing data — recalculate to populate.
            </p>
          )}

          {/* ── Cover Paper ── */}
          <Section title="📘 Cover Paper" accent="indigo">
            <Row
              label="Paper Type"
              value={
                item.selectedCoverPaper?.paper_name ||
                costing?.msCoverPaper?.paper_name
              }
            />
            <Row
              label="GSM"
              value={item.selectedCoverPaper?.gsm || costing?.msCoverPaper?.gsm}
            />
            <Row
              label="Sheet Size"
              value={
                item.selectedCoverPaper?.size_name ||
                costing?.msCoverPaper?.size_name
              }
            />
            <Row label="Cover Pages" value={item.cover_pages} />

            {/* ── Cover print indicator ── */}
            {coverToPrint ? (
              <>
                <Row label="Color Scheme" value={item.cover_color_scheme} />
                <Row label="Press" value={item.cover_press_type} />
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <span>🚫</span>
                <span>Cover not sent to press — paper cost only</span>
              </div>
            )}

            {costing && (
              <>
                {viewMode === "account" && (
                  <Row label="UPS" value={costing.ms_cover_ups} />
                )}

                {/* If viewMode is outbound then show the sheets used and sheets used including Wastage */}
                {viewMode === "outbound" && (
                  <>
                    <Row label="Sheets" value={costing.ms_cover_sheets} />
                    <Row
                      label="With Wastage"
                      value={costing.ms_cover_sheets_with_wastage}
                    />
                  </>
                )}

                {viewMode === "account" && (
                  <>
                    <Row
                      label="Rate / Sheet"
                      value={
                        costing.ms_cover_sheet_rate
                          ? `₹${costing.ms_cover_sheet_rate}`
                          : null
                      }
                    />
                    <div className="mt-1 space-y-1">
                      <CostRow
                        label="Sheet Cost"
                        value={costing.ms_cover_sheet_cost}
                      />
                      {coverToPrint && (
                        <CostRow
                          label="Printing Cost"
                          value={costing.ms_cover_printing_cost}
                        />
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </Section>

          {/* Binding summary */}
          {viewMode === "account" && costing?.binding_cost > 0 && (
            <Section title="📎 Binding" accent="slate">
              <CostRow label="Binding Cost" value={costing.binding_cost} />
            </Section>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          WIDE FORMAT
      ══════════════════════════════════════════════════════════════════ */}
      {isWide && (
        <Section title="🖼 Wide Format Material" accent="purple">
          <Row
            label="Material"
            value={
              item.selectedWideMaterial?.material_name ||
              costing?.wfMaterial?.material_name
            }
          />
          {(item.selectedWideMaterial?.gsm || costing?.wfMaterial?.gsm) && (
            <Row
              label="GSM"
              value={item.selectedWideMaterial?.gsm || costing?.wfMaterial?.gsm}
            />
          )}
          {(item.selectedWideMaterial?.thickness_mm ||
            costing?.wfMaterial?.thickness_mm) && (
            <Row
              label="Thickness"
              value={`${item.selectedWideMaterial?.thickness_mm || costing?.wfMaterial?.thickness_mm} mm`}
            />
          )}
          {item.selectedWideMaterial?.board_width_ft && (
            <Row
              label="Board Size"
              value={`${item.selectedWideMaterial.board_width_ft} × ${item.selectedWideMaterial.board_height_ft} ft`}
            />
          )}
          {viewMode === "account" && costing && (
            <>
              <Row
                label="Calc Type"
                value={costing.wf_calculation_type?.toUpperCase()}
              />
              <Row
                label="Rolls/Boards Used"
                value={costing.wf_rolls_or_boards_used}
              />
              <Row label="UPS (board)" value={costing.wf_ups} />
              <Row
                label="Wastage"
                value={
                  costing.wf_wastage_sqft != null
                    ? `${Number(costing.wf_wastage_sqft).toFixed(2)} sqft`
                    : null
                }
              />
              <div className="mt-1 space-y-1">
                <CostRow
                  label="Material Cost"
                  value={costing.wf_material_cost}
                />
                <CostRow
                  label="Printing Cost"
                  value={costing.wf_printing_cost}
                />
                <CostRow label="Binding Cost" value={costing.binding_cost} />
              </div>
            </>
          )}
        </Section>
      )}

      {/* ── Pricing Summary ── */}
      {viewMode === "account" && costing && (
        <Section title="💰 Pricing" accent="green">
          <div className="space-y-1">
            {costing.total_sheet_cost > 0 && (
              <CostRow
                label="Total Sheet Cost"
                value={costing.total_sheet_cost}
              />
            )}
            {costing.total_printing_cost > 0 && (
              <CostRow
                label="Total Printing Cost"
                value={costing.total_printing_cost}
              />
            )}
            {costing.binding_cost > 0 && (
              <CostRow label="Binding Cost" value={costing.binding_cost} />
            )}
            <CostRow
              label="Sheet Cost / Copy"
              value={costing.sheet_cost_per_copy}
            />
            <CostRow
              label="Printing Cost / Copy"
              value={costing.printing_cost_per_copy}
            />
            {costing.binding_cost_per_copy > 0 && (
              <CostRow
                label="Binding / Copy"
                value={costing.binding_cost_per_copy}
              />
            )}
            <div className="border-t border-green-200 pt-1 mt-1">
              <CostRow label="Unit Rate" value={costing.unit_rate} />
              <CostRow label="Item Total" value={costing.item_total} />
            </div>
          </div>
        </Section>
      )}

      {/* ── Pricing Summary ── */}
      {viewMode === "account" && costing && (
        <Section title="💰 Pricing" accent="green">
          <div className="space-y-1">
            {costing.total_sheet_cost > 0 && (
              <CostRow
                label="Total Sheet Cost"
                value={costing.total_sheet_cost}
              />
            )}
            {costing.total_printing_cost > 0 && (
              <CostRow
                label="Total Printing Cost"
                value={costing.total_printing_cost}
              />
            )}
            {costing.binding_cost > 0 && (
              <CostRow label="Binding Cost" value={costing.binding_cost} />
            )}
            <CostRow
              label="Sheet Cost / Copy"
              value={costing.sheet_cost_per_copy}
            />
            <CostRow
              label="Printing Cost / Copy"
              value={costing.printing_cost_per_copy}
            />
            {costing.binding_cost_per_copy > 0 && (
              <CostRow
                label="Binding / Copy"
                value={costing.binding_cost_per_copy}
              />
            )}
            <div className="border-t border-green-200 pt-1 mt-1">
              <CostRow label="Unit Rate" value={costing.unit_rate} />
              <CostRow label="Item Total" value={costing.item_total} />
            </div>
          </div>
        </Section>
      )}

      {/* Fallback pricing if no costing row yet */}
      {viewMode === "account" && !costing && (item.unit_rate || item.item_total) && (
        <Section title="💰 Pricing (summary only)" accent="green">
          <p className="text-xs text-slate-400 italic mb-1">
            Detailed breakdown not available — recalculate to populate.
          </p>
          <CostRow label="Unit Rate" value={item.unit_rate} />
          <CostRow label="Item Total" value={item.item_total} />
        </Section>
      )}
    </div>
  );
}

// ── Main Sidebar Component ──

export default function JobItemsSidebar({
  jobNo,
  onClose,
  viewMode = "default",
}) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobNo) return;

    setLoading(true);
    setItems(null);

    api
      .get(`/api/fms/common-dashboard/jobs/${jobNo}/items`)
      .then((res) => {
        setItems(res.data);
        console.log("Loaded job items:", res.data);
      })
      .catch((err) => console.error("Failed to load job items", err))
      .finally(() => setLoading(false));
  }, [jobNo]);

  if (!jobNo) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
        className="fixed top-0 right-0 h-full w-full sm:w-[40%] bg-white shadow-2xl z-50 flex flex-col"
      >
        <div className="shrink-0 bg-blue-600 text-white flex justify-between items-center p-4">
          <h3 className="text-lg font-semibold">🧾 Items for Job 
            <span className="bg-yellow-300 text-blue-900 px-2 py-0.5 rounded-md font-bold ml-2">
              #{jobNo}
            </span>
          </h3>
          <button
            onClick={onClose}
            className="text-2xl leading-none hover:opacity-75"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {loading && (
            <p className="text-sm text-gray-500 animate-pulse">
              Loading items…
            </p>
          )}
          {!loading && items?.length === 0 && (
            <p className="text-sm text-gray-500">No items found.</p>
          )}
          {!loading &&
            items?.map((item, index) => (
              <ItemCard
                key={item.id}
                item={item}
                index={index}
                viewMode={viewMode}
              />
            ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
