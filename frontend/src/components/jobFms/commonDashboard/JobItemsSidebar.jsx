import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import api from "../../../lib/api";

export default function JobItemsSidebar({ jobNo, onClose }) {
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
      })
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
        className="fixed top-0 right-0 h-full w-full sm:w-[35%] bg-white shadow-2xl z-50 overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-blue-600 text-white flex justify-between items-center p-4">
          <h3 className="text-lg font-semibold">🧾 Items for Job #{jobNo}</h3>
          <button onClick={onClose} className="text-2xl">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading && <p className="text-sm text-gray-500">Loading items…</p>}

          {!loading && items?.length === 0 && (
            <p className="text-sm text-gray-500">No items found.</p>
          )}

          {!loading &&
            items?.map((item, index) => (
              <div
                key={item.id}
                className="border rounded-xl p-4 shadow-sm bg-slate-50 mb-4 space-y-4"
              >
                {/* HEADER */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <h4 className="font-semibold text-blue-700">
                    Item {index + 1}: {item.category}
                  </h4>

                  <span
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded max-w-full sm:max-w-[220px] truncate"
                    title={item.enquiry_for}
                  >
                    {item.enquiry_for || "—"}
                  </span>
                </div>

                {/* BASIC DETAILS */}
                <div className="space-y-2 text-gray-700 text-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <span className="font-medium shrink-0">
                      Client Size (Finished):
                    </span>
                    <span className="break-words sm:truncate" title={item.size}>
                      {item.size || "—"}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <span className="font-medium shrink-0">Quantity:</span>
                    <span>
                      {item.quantity || 0} {item.uom || ""}
                    </span>
                  </div>

                  {item.color_scheme && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="font-medium shrink-0">
                        Color Scheme:
                      </span>
                      <span>{item.color_scheme}</span>
                    </div>
                  )}

                  {item.sides && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="font-medium shrink-0">Sides:</span>
                      <span>{item.sides}</span>
                    </div>
                  )}

                  {/* COMMON BINDING */}
                  {item.binding_types && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="font-medium shrink-0">Binding:</span>
                      <span
                        className="break-words sm:truncate"
                        title={
                          Array.isArray(item.binding_types)
                            ? item.binding_types.join(", ")
                            : item.binding_types
                        }
                      >
                        {Array.isArray(item.binding_types)
                          ? item.binding_types.join(", ")
                          : item.binding_types}
                      </span>
                    </div>
                  )}
                  {/* FOLDING & CREASING */}
                  {item.no_of_foldings && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="font-medium shrink-0">Folding:</span>
                      <span>
                        {item.no_of_foldings ? (
                          <>
                            <strong>{item.no_of_foldings}</strong> fold(s) per
                            item
                          </>
                        ) : (
                          ""
                        )}
                      </span>
                    </div>
                  )}

                  {item.no_of_creases && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="font-medium shrink-0">Creasing:</span>
                      <span>
                        {item.no_of_creases ? (
                          <>
                            <strong>{item.no_of_creases}</strong> crease(s) per
                            item
                          </>
                        ) : (
                          ""
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* PAPER DETAILS */}
                {item.selectedPaper && (
                  <div className="border rounded-lg p-3 bg-white space-y-2">
                    <h6 className="font-semibold text-gray-700">
                      🧻 Paper Details
                    </h6>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                      <span className="font-medium shrink-0">Paper Type:</span>
                      <span
                        className="break-words sm:truncate"
                        title={item.selectedPaper.paper_name}
                      >
                        {item.selectedPaper.paper_name}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                      <span className="font-medium shrink-0">GSM:</span>
                      <span>{item.selectedPaper.gsm}</span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                      <span className="font-medium shrink-0">
                        Paper Size (Press):
                      </span>
                      <span
                        className="break-words sm:truncate"
                        title={item.selectedPaper.size_name}
                      >
                        {item.selectedPaper.size_name}
                      </span>
                    </div>

                    {item.inside_pages && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                        <span className="font-medium shrink-0">
                          Inside Pages:
                        </span>
                        <span>{item.inside_pages || "—"}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* MULTIPLE SHEET ONLY */}
                {item.category === "Multiple Sheet" && (
                  <>
                    {item.selectedCoverPaper && (
                      <div className="border rounded-lg p-3 bg-slate-100 space-y-2">
                        <h6 className="font-semibold text-gray-700">
                          📘 Cover Paper Details
                        </h6>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                          <span className="font-medium shrink-0">
                            Cover Type:
                          </span>
                          <span
                            className="break-words sm:truncate"
                            title={item.selectedCoverPaper.paper_name}
                          >
                            {item.selectedCoverPaper.paper_name}
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                          <span className="font-medium shrink-0">
                            Cover GSM:
                          </span>
                          <span>{item.selectedCoverPaper.gsm}</span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                          <span className="font-medium shrink-0">
                            Cover Pages:
                          </span>
                          <span>{item.cover_pages || "—"}</span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                          <span className="font-medium shrink-0">
                            Cover Color:
                          </span>
                          <span>{item.cover_color_scheme || "—"}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* WIDE MATERIAL DETAILS */}
                {item.selectedWideMaterial && (
                  <div className="border rounded-lg p-3 bg-white space-y-2">
                    <h6 className="font-semibold text-gray-700">
                      🧻 Wide Material Details
                    </h6>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                      <span className="font-medium shrink-0">
                        Material Name:
                      </span>
                      <span
                        className="break-words sm:truncate"
                        title={item.selectedWideMaterial.material_name}
                      >
                        {item.selectedWideMaterial.material_name}
                      </span>
                    </div>

                  {item.selectedWideMaterial?.gsm && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                      <span className="font-medium shrink-0">GSM:</span>
                      <span>{item.selectedWideMaterial.gsm}</span>
                    </div>
                  )}


                  {item.selectedWideMaterial?.thickness_mm && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                      <span className="font-medium shrink-0">Thickness:</span>
                      <span>{item.selectedWideMaterial?.thickness_mm} mm</span>
                    </div>
                  )}



                    {/* {item.selectedWideMaterial.roll_width_ft && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                        <span className="font-medium shrink-0">
                          Material Size (Press):
                        </span>
                        <span
                          className="break-words sm:truncate"
                          title={item.selectedWideMaterial.roll_width_ft + "ft x " + item.selectedWideMaterial.roll_length_mtr + "mtr"}
                        >
                          {item.selectedWideMaterial.roll_width_ft + "ft x " + item.selectedWideMaterial.roll_length_mtr + "mtr"}
                        </span>
                      </div>                        
                    )} */}

                    {item.selectedWideMaterial.board_width_ft && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                        <span className="font-medium shrink-0">
                          Material Size (Press):
                        </span>
                        <span>
                          {item.selectedWideMaterial.board_width_ft +
                            " x " +
                            item.selectedWideMaterial.board_height_ft +
                            " ft"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
