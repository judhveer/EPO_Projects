// Creates one empty inside-paper row for Multiple Sheet category.
// Each inside paper tracks its own paper type, GSM, whether to print,
// and if printing — its color scheme and press machine.
export const createEmptyInsidePaper = () => ({
  _id:
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString() + Math.random(),
  paper_type: "",
  paper_gsm: "",
  to_print: false, // checkbox: does this paper get sent to press?
  color_scheme: "", // only matters when to_print = true
  press_type: "", // only matters when to_print = true
  available_gsm: [], // UI-only: GSM options for this paper's paper_type
});