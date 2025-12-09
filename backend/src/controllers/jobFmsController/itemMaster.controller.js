console.log("getItemsByCategory controller loaded");
import models from "../../models/index.js";
const { ItemMaster, PaperMaster, BindingMaster, SizeMaster } = models;

export const getItemsByCategory = async (req, res) => {
  console.log("getItemsByCategory called:");
  try {
    const { category } = req.query;

    if (!category) {
      return res.status(400).json({ message: "Category is required" });
    }

    const items = await ItemMaster.findAll({
      where: { category },
      attributes: ["id", "item_name"],
      order: [["item_name", "ASC"]],
    });

    return res.json(items);
  } catch (err) {
    console.error("Error fetching items by category:", err);
    return res.status(500).json({
      message: "Failed to fetch items by category",
      error: err.message,
    });
  }
};

export const getAllPaperTypes = async (req, res) => {
  console.log("getAllPaperTypes called: ");
  try {
    const papers = await PaperMaster.findAll({
      where: {},
      attributes: [
        PaperMaster.sequelize.fn(
          "DISTINCT",
          PaperMaster.sequelize.col("paper_name")
        ),
        "paper_name",
      ],
    });
    return res.json(papers);
  } catch (err) {
    console.error("Error fetching paper types:", err);
    return res.status(500).json({
      message: "Failed to fetch paper types",
      error: err.message,
    });
  }
};

export const getGsmByPaperType = async (req, res) => {
  console.log("getPaperTypeGsm called: ");
  try {
    const { paperName } = req.query;
    const gsm = await PaperMaster.findAll({
      where: { paper_name: paperName },
      attributes: [
        [
          PaperMaster.sequelize.fn("MIN", PaperMaster.sequelize.col("id")),
          "id",
        ],
        "gsm",
        "size_category",
      ],
      group: ["gsm", "size_category"],
      raw: true,
    });

    return res.json(gsm);
  } catch (err) {
    console.error("Error fetching gsm by paper type:", err);
    return res.status(500).json({
      message: "Failed to fetch gsm by paper type",
      error: err.message,
    });
  }
};

export const getBindingsByCategory = async (req, res) => {
  console.log("getBindingsByCategory called: ");
  try {
    const { category } = req.query;
    const bindings = await BindingMaster.findAll({
      where: {
        category,
      },
      attributes: [
        BindingMaster.sequelize.fn(
          "DISTINCT",
          BindingMaster.sequelize.col("binding_name")
        ),
        "binding_name",
      ],
    });
    return res.json(bindings);
  } catch (err) {
    console.error("Error fetching bindings by category:", err);
    return res.status(500).json({
      message: "Failed to fetch bindings by category",
      error: err.message,
    });
  }
};


// GET /api/fms/sizes?search=a
export const getSizes = async (req, res) => {
  console.log("getSizes called: ");
  try {
    const search = req.query.search || "";

    const sizes = await SizeMaster.findAll({
      where: {
        name: SizeMaster.sequelize.where(
          SizeMaster.sequelize.fn("LOWER", SizeMaster.sequelize.col("name")),
          "LIKE",
          `%${search.toLowerCase()}%`
        )
      },
      order: [["name", "ASC"]],
    });

    res.json(sizes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load sizes" });
  }
};







// calculations:

// Parse size "6x9" → { width: 6, height: 9 }
// ---------------------- SIZE PARSER ----------------------
const parseSize = (sizeStr) => {
  if (!sizeStr) return null;
  const [w, h] = sizeStr.toLowerCase().split("x").map(Number);
  return { width: parseFloat(w), height: parseFloat(h) };
};

// ---------------------- UPS CALCULATION ----------------------
const calculateUps = (sheet, job) => {
  const normal =
    Math.floor(sheet.width / job.width) * Math.floor(sheet.height / job.height);

  const rotated =
    Math.floor(sheet.width / job.height) * Math.floor(sheet.height / job.width);

  return Math.max(normal, rotated, 1);
};

export const calculateItemController = async (req, res) => {
  console.log("calculateItemController called:");

  try {
    const { item, all_items } = req.body;

    if (!item) {
      return res.status(400).json({ message: "Missing item data" });
    }

    // extract fields
    const {
      paper_type,
      paper_gsm,
      cover_paper_type,
      cover_paper_gsm,
      size,
      color_scheme, // for single-sheet or used for inside/cover separately if provided
      // for multiple-sheet you may have inside_color_scheme and cover_color_scheme
      cover_color_scheme,
      sides, // "Single Side" or "Both Side" — applies to printing multiplication
      category,
      binding_types = [],
      quantity,
      inside_pages = 0,
      cover_pages = 0,
    } = item;

    console.log("item: ", item);

    if (!paper_type || !paper_gsm || !size || !quantity) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const qty = Number(quantity);

    // ------------------- 1. Parse custom size -------------------
    const jobSize = parseSize(size);
    if (!jobSize) {
      return res.status(400).json({ message: "Invalid size format" });
    }

    console.log("jobSize: ", jobSize);

    // ------------------- 2. Find paper rows for inside (or single) -------------------
    const insidePaperRows = await PaperMaster.findAll({
      where: { paper_name: paper_type, gsm: paper_gsm },
    });


    if (!insidePaperRows || insidePaperRows.length === 0) {
      return res.status(404).json({ message: "Inside paper not found" });
    }

    let { bestSheet: bestInsideSheet, bestUps: bestUpsInside } = pickBestSheet(insidePaperRows, jobSize);

    if(sides === "Both Side" ){
      bestUpsInside = bestUpsInside * 2;
    }

    console.log("bestSheet: ", bestInsideSheet);
    console.log("bestUps: ", bestUpsInside);

    if (!bestInsideSheet || !bestUpsInside) {
      return res
        .status(500)
        .json({ message: "Inside sheet / UPS selection failed" });
    }

    // ------------------- 3. If Multiple Sheet: find cover sheet separately -------------------
    let bestCoverSheet = bestInsideSheet;
    let bestUpsCover = bestUpsInside;

    if (category === "Multiple Sheet") {
      const covType = cover_paper_type;
      const covGsm = cover_paper_gsm;

      let coverPaperRows = await PaperMaster.findAll({
        where: { paper_name: covType, gsm: covGsm },
      });

      // fallback to insidePaperRows if none found
      if (!coverPaperRows || coverPaperRows.length === 0)
        coverPaperRows = insidePaperRows;

      const picked = pickBestSheet(coverPaperRows, jobSize);
      bestCoverSheet = picked.bestSheet ;
      bestUpsCover = picked.bestUps;

      console.log("picked: ", picked);
    }

    // ------------------- 4. Compute sheets required -------------------
    let insideSheets = 0;
    let coverSheets = 0;

    if (category === "Multiple Sheet") {
      const inside_total_pages = Number(inside_pages) * qty; // pages × copies
      insideSheets = Math.ceil(inside_total_pages / bestUpsInside);


      const cover_total_pages = Number(cover_pages) * qty;
      coverSheets = Math.ceil(cover_total_pages / bestUpsCover);

      console.log("cover_total_pages:", cover_total_pages);
      console.log("coverSheets: ", coverSheets);
    } else {
      // Single sheet/Other/Wide format: treat as single sheet requirement
      insideSheets = Math.ceil(qty / bestUpsInside);
      coverSheets = 0;
    }

    console.log("total inside sheets: ", insideSheets);

    // Apply 5% wastage per sheet type (round up)
    const insideSheetsWithWastage = Math.ceil(insideSheets * 1.05);

    console.log("inside sheets with wastage: ", insideSheetsWithWastage);

    const coverSheetsWithWastage = Math.ceil(coverSheets * 1.05);
    const totalSheetsWithWastage =
      insideSheetsWithWastage + coverSheetsWithWastage;

      console.log('totalSheetsWithWastage: ', totalSheetsWithWastage);

      console.log("coverSheetsWithWastage: ", coverSheetsWithWastage);

    // ------------------- 5. Sheet cost calculation (separate rates) -------------------
    const insideSheetRate = Number(bestInsideSheet.rate_per_sheet || 0);
    const insideTotalSheetCost = insideSheetsWithWastage * insideSheetRate;

    console.log("insideSheet Rate: ", insideSheetRate);

    console.log("inside total Sheet Cost ", insideTotalSheetCost);

    let coverSheetRate = insideSheetRate;
    let coverTotalSheetCost = 0;
    if (coverSheets > 0) {
      coverSheetRate = Number(bestCoverSheet.rate_per_sheet || insideSheetRate);
      coverTotalSheetCost = coverSheetsWithWastage * coverSheetRate;
      console.log("coverSheetRate: ", coverSheetRate);
      console.log("coverTotalSheetCost: ", coverTotalSheetCost);
    }

    const totalSheetCost = insideTotalSheetCost + coverTotalSheetCost;

    console.log("totalSheetCost ", totalSheetCost);

    // ------------------- 6. Printing cost (per sheet) -------------------
    // Determine color scheme per part
    // For single-sheet categories we use color_scheme; for multiple we prefer inside_color_scheme/cover_color_scheme
    const insideColor =
      category === "Multiple Sheet"
        ? color_scheme
        : color_scheme;
    const coverColor =
      category === "Multiple Sheet"
        ? cover_color_scheme || color_scheme
        : color_scheme;

    const insidePrintRatePerSheet = getPrintRatePerSheet(insideColor);
    const coverPrintRatePerSheet = getPrintRatePerSheet(coverColor);

    console.log("inside print rate per sheet: ", insidePrintRatePerSheet);

    console.log("coverPrintRatePerSheet: ", coverPrintRatePerSheet);

    // sides handling: if Both Side, double the per-sheet print rate
    const sideMultiplier =
      sides === "Both Side" || sides === "Both Sides" ? 2 : 1;

    // Printing costs computed on sheet counts (with wastage)
    const insidePrintingCostTotal =
      insidePrintRatePerSheet * insideSheetsWithWastage * sideMultiplier;
    const coverPrintingCostTotal =
      coverPrintRatePerSheet * coverSheetsWithWastage * sideMultiplier;

      console.log("insidePrintingCostTotal: ", insidePrintingCostTotal);
      console.log("coverPrintingCostTotal: ", coverPrintingCostTotal);

    const totalPrintingCost = insidePrintingCostTotal + coverPrintingCostTotal;

    console.log("totalPrintingCost: ", totalPrintingCost);

    // ------------------- 7. Binding cost (applies on total qty) -------------------
    let bindingCostTotal = 0;
    if (binding_types && binding_types.length > 0) {
      // fetch all binding rows matching selected names across categories (we will filter by category logic inside calculation)
      const bindingRows = await BindingMaster.findAll({
        where: { binding_name: binding_types },
      });

      bindingCostTotal = calculateBindingCost(bindingRows, item, qty);
    }

    console.log("bindingCostTotal: ", bindingCostTotal);

    // ------------------- 8. Unit rate & totals -------------------
    // total sheet cost per copy
    const sheetCostPerCopy = totalSheetCost / qty;

    // printing cost per copy (distribute printing cost across copies)
    const printingCostPerCopy = totalPrintingCost / qty;

    // binding cost per copy (user wanted binding applied on total qty)
    const bindingCostPerCopy = bindingCostTotal / qty;

    // final unit rate
    const unitRate =
      Number(sheetCostPerCopy) +
      Number(printingCostPerCopy) +
      Number(bindingCostPerCopy);


      console.log("unit rate: ", unitRate);

    const itemTotal = unitRate * qty;

    console.log("itemTotal: ", itemTotal);

    // ------------------- 9. Grand total (sum of all items) -------------------
    let grandTotal = 0;
    if (Array.isArray(all_items)) {
      all_items.forEach((it) => {
        if (it && it.item_total) grandTotal += Number(it.item_total);
      });
    }
    grandTotal += itemTotal;

    // ------------------- 10. Return full breakdown -------------------
    return res.json({
      inside: {
        sheet_selected: bestInsideSheet.size_name,
        sheet_dimensions: `${bestInsideSheet.width}x${bestInsideSheet.height}`,
        ups: bestUpsInside,
        sheets: insideSheets,
        sheets_with_wastage: insideSheetsWithWastage,
        sheet_rate: insideSheetRate,
        total_sheet_cost: insideTotalSheetCost,
        printing_rate_per_sheet: insidePrintRatePerSheet,
        printing_cost_total: insidePrintingCostTotal,
      },

      cover: {
        sheet_selected: bestCoverSheet ? bestCoverSheet.size_name : null,
        sheet_dimensions: bestCoverSheet
          ? `${bestCoverSheet.width}x${bestCoverSheet.height}`
          : null,
        ups: bestUpsCover,
        sheets: coverSheets,
        sheets_with_wastage: coverSheetsWithWastage,
        sheet_rate: coverSheetRate,
        total_sheet_cost: coverTotalSheetCost,
        printing_rate_per_sheet: coverPrintRatePerSheet,
        printing_cost_total: coverPrintingCostTotal,
      },

      totals: {
        total_sheets_with_wastage: totalSheetsWithWastage,
        total_sheet_cost: totalSheetCost,
        total_printing_cost: totalPrintingCost,
        total_binding_cost: bindingCostTotal,
        sheet_cost_per_copy: sheetCostPerCopy,
        printing_cost_per_copy: printingCostPerCopy,
        binding_cost_per_copy: bindingCostPerCopy,
        unit_rate: unitRate,
        item_total: itemTotal,
        grand_total: grandTotal,
      },
    });
  } catch (err) {
    console.error("CALCULATION ERROR:", err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

// ---------------------- BINDING COST ----------------------
// Binding cost calculator
// bindingRows: rows fetched from BindingMaster for selected binding names
// item: the item object (contains inside_pages, cover_pages, etc.)
// qty: number of copies
const calculateBindingCost = (bindingRows, item, qty) => {
  let totalBindingCost = 0;
  const pages = Number(item.inside_pages || 0);

  // Special handling for Perfect Bound if present in bindingRows
  const perfectRows = bindingRows.filter((b) =>
    b.binding_name.toLowerCase().includes("perfect bound")
  );

  if (perfectRows.length > 0) {
    // Map units to rates for perfect bound rows
    const rate_map = {};
    perfectRows.forEach((r) => {
      const unit = r.unit; // 'base', 'less_than_48_pages', 'per_100_pages'
      rate_map[unit] = Number(r.rate_per_unit || 0);
    });

    if (qty < 48 && rate_map["less_than_48_pages"]) {
      totalBindingCost += rate_map["less_than_48_pages"] * qty;
    } else if (qty < 100 && rate_map["base"]) {
      // base applied per copy in your requirement (48-99)
      totalBindingCost += rate_map["base"] * qty;
    } else if (qty >= 100 && rate_map["per_100_pages"]) {
      // per_100_pages applied as per 100 copies (rounded up)
      const blocks = Math.ceil(qty / 100);
      totalBindingCost += rate_map["per_100_pages"] * blocks;
    } else {
      // fallback if specific perfect rates missing -> try to use any 'base' or per_copy
      if (rate_map["base"]) totalBindingCost += rate_map["base"] * qty;
      else {
        // fallback to per_copy entries for Perfect Bound rows if any
        const perCopy = perfectRows.find((r) => r.unit === "per_copy");
        if (perCopy)
          totalBindingCost += Number(perCopy.rate_per_unit || 0) * qty;
      }
    }

    // remove perfectRows from further generic processing
    bindingRows = bindingRows.filter(
      (b) => !b.binding_name.toLowerCase().includes("perfect bound")
    );
  }

  // Generic processing for remaining bindings
  for (const b of bindingRows) {
    const unit = b.unit;
    const rate = Number(b.rate_per_unit || 0);

    switch (unit) {
      case "per_copy":
        totalBindingCost += rate * qty;
        break;

      case "per_page":
        // apply per_page to inside pages * qty
        totalBindingCost += rate * pages * qty;
        break;

      case "flat":
        // per your instruction, binding cost applies on total quantity — so treat flat as per copy
        totalBindingCost += rate * qty;
        break;

      case "base":
        // non-perfect base => treat as per copy (since you said binding applies on total quantity)
        totalBindingCost += rate * qty;
        break;

      case "less_than_48_pages":
        if (qty < 48) totalBindingCost += rate * qty;
        break;

      case "per_100_pages":
        // treat this as per 100 copies (rounded up)
        const blocks = Math.ceil(qty / 100);
        totalBindingCost += rate * blocks;
        break;

      default:
        // unknown unit -> treat as per_copy as a safe default
        totalBindingCost += rate * qty;
        break;
    }
  }

  return totalBindingCost;
};

// ---------------------- PRINT COST (Color Based) ----------------------
// print cost per sheet (base rate). We'll multiply by sides later.
// Using your static mapping (matches Color Scheme table)
const getPrintRatePerSheet = (colorScheme) => {
  switch ((colorScheme || "").toString()) {
    case "Black and White":
      return 10;
    case "Multicolor":
      return 20;
    case "Bi-Color":
      return 30;
    case "Tri-Color":
      return 40;
    default:
      return 0;
  }
};

// ---------------------- BEST SHEET PICKING ----------------------
const pickBestSheet = (paperRows, jobSize) => {
  let bestSheet = null;
  let bestUps = 0;

  for (const s of paperRows) {
    const ups = calculateUps({ width: s.width, height: s.height }, jobSize);

    if (ups > bestUps) {
      bestUps = ups;
      bestSheet = s;
    }
  }

  return { bestSheet, bestUps };
};
