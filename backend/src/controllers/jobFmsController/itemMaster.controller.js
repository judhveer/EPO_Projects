import { Op, where } from "sequelize";
import models from "../../models/index.js";
const { ItemMaster, PaperMaster, BindingMaster, SizeMaster, WideFormatMaterial, PrintingRateMaster } = models;

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
        // "size_category",
      ],
      group: ["gsm"],
      // group: ["gsm", "size_category"],
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


// controller
export const getWideMaterialTypes = async (req, res) => {
  console.log("getWideMaterialTypes called: ");
  try{
    const materials = await WideFormatMaterial.findAll({
      attributes: [
        WideFormatMaterial.sequelize.fn(
          "DISTINCT",
          WideFormatMaterial.sequelize.col("material_name")
        ),
        "material_name",
      ],
      group: ["material_name"],
      order: [["material_name", "ASC"]],
    });

    return res.json(materials);

  } catch (err) {
    console.error("Error fetching wide material types:", err);
    return res.status(500).json({
      message: "Failed to fetch wide material types",
      error: err.message,
    });
  }
};


export const getGsmByWideMaterialTypes = async (req, res) => {
  console.log("getGsmByWideMaterialTypes called: ");
  try{
    const { materialName } = req.query;

    const gsm = await WideFormatMaterial.findAll({
      where: { 
        material_name: materialName,
        [Op.or]: [
          { gsm: { [Op.ne]: null } },
          { thickness_mm: { [Op.ne]: null } },
        ],
      },
      attributes: [
        [
          WideFormatMaterial.sequelize.fn("MIN", WideFormatMaterial.sequelize.col("id")),
          "id",
        ],
        "gsm",
        "thickness_mm",
      ],
      group: ["gsm", "thickness_mm"],
      raw: true,
    });
    return res.json(gsm);
  }
  catch (err) {
    console.error("Error fetching gsm by wide material types:", err);
    return res.status(500).json({
      message: "Failed to fetch gsm by wide material types",
      error: err.message,
    });
  };
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

// SIZE PARSER
// Converts "6x9 in", "15x21 cm", "3x4 ft" → { width, height, unit }
// Output unit is always "inches" for Single/Multiple Sheet, "feet" for Wide Format
//
const parseSize = (sizeStr, category) => {
  if (!sizeStr) return null;

  const regex = /^(\d+(\.\d+)?)x(\d+(\.\d+)?)\s?(mm|cm|in|ft)$/i;
  const match = sizeStr.trim().toLowerCase().match(regex);

  if (!match) return null;

  let width = parseFloat(match[1]);
  let height = parseFloat(match[3]);
  const unit = match[5];

  // STEP 1: convert input → inches
  switch (unit) {
    case "mm":
      width /= 25.4;
      height /= 25.4;
      break;
    case "cm":
      width /= 2.54;
      height /= 2.54;
      break;
    case "ft":
      width *= 12;
      height *= 12;
      break;
    case "in":
      break;
  }

  if (category === "Wide Format") {
    return {
      width: width / 12,
      height: height / 12,
      unit: "feet"
    };
  }

  return { width, height, unit: "inches" }; // fallback
};


// ── WASTAGE MULTIPLIER ────────────────────────────────────────────────────────
// Returns the sheets-with-wastage multiplier based on press type.
//   HMT / AUTOPRINT → 10% wastage  (1.10)
//   DIGITAL         →  5% wastage  (1.05)
//   FLEX / PLOTTER  →  0% wastage  (1.00) — material is cut to size, no spoilage
//   unknown/null    →  5% wastage  (1.05) — safe default
const getWastageMultiplier = (pressType) => {
  const p = (pressType || "").toUpperCase();
  if (p.startsWith("HMT") || p === "AUTOPRINT")     return 1.10;
  if (p.startsWith("DIGITAL"))                       return 1.05;
  if (p === "FLEX MACHINE" || p.startsWith("PLOTTER")) return 1.00;
  return 1.05; // safe default
};


// ── DIGITAL BLEED ─────────────────────────────────────────────────────────────
// Digital presses auto-add a margin around the artwork.
// We add 5 mm on each of the four sides to the job size so UPS calculation
// accounts for the extra space the press will consume.
// Returns a new jobSize object — the original is never mutated.
// Only applied when the press is digital; all other presses return jobSize unchanged.
const DIGITAL_BLEED_MM  = 5;                            // mm per side
const DIGITAL_BLEED_IN  = DIGITAL_BLEED_MM / 25.4;     // ≈ 0.1969 inches per side

const addDigitalBleed = (jobSize, pressType) => {
  const p = (pressType || "").toUpperCase();
  if (!p.startsWith("DIGITAL")) return jobSize;         // no bleed for non-digital
  return {
    ...jobSize,
    width:  jobSize.width  + 2 * DIGITAL_BLEED_IN,     // both left + right sides
    height: jobSize.height + 2 * DIGITAL_BLEED_IN,     // both top + bottom sides
  };
};



// ---------------------- UPS CALCULATION ----------------------
// How many job-size pieces fit on one sheet (try normal + rotated orientation)
const calculateUps = (sheet, job, requireEven = false) => {
  const normal = Math.floor(sheet.width / job.width) * Math.floor(sheet.height / job.height);

  const rotated = Math.floor(sheet.width / job.height) * Math.floor(sheet.height / job.width);

  if (!requireEven) {
    return Math.max(normal, rotated);
  }

  // Phase 1 — orientations that naturally land on even UPS (preferred)
  // "Natural even" means the grid itself produces an even number without adjustment.
  // Example: 23x36 / 7.5x10 → normal=9 (odd, rejected), rotated=8 (even, accepted) 
  const naturalEvens = [normal, rotated].filter( (ups) => ups > 0 && ups % 2 === 0);
  if (naturalEvens.length > 0) {
    return Math.max(...naturalEvens);
  }

  // Phase 2 — no orientation is naturally even; round the best down to nearest even
  // Example: if both orientations gave odd UPS, press operator leaves one cell blank to make it even. So 9 becomes 8, 7 becomes 6, etc.
  const best    = Math.max(normal, rotated);
  const rounded = best % 2 === 0 ? best : best - 1;

  // ── Phase 3: rounding gave 0 (best was 1, the only fit is odd=1) ─────────
  // Returning 0 causes pickBestSheet to skip this sheet entirely, which can
  // produce "Sheet / UPS selection failed" even though the sheet physically fits.
  // Instead: return the odd UPS as-is. The caller (effectiveUps logic) will use
  // it, and the press operator handles the odd count manually.
  if (rounded === 0 && best > 0) {
    return best; // best is odd (e.g. 1) — better than nothing
  }
  return rounded;
};

// ---------------------- BEST SHEET PICKING ----------------------
// Given a list of paper rows and the job size, returns the sheet with the highest UPS (most efficient fit).
// requireEvenUps: pass true for Both Side Multiple Sheet
const pickBestSheet = (paperRows, jobSize, requireEvenUps = false) => {
  console.log("Pick best sheet called:");
  let bestSheet = null;
  let bestUps = 0;
  let bestWastage = Infinity;

  for (const s of paperRows) {
    const ups = calculateUps({ width: s.width, height: s.height }, jobSize, requireEvenUps);
    if(ups === 0) continue; // sheet is too small to fit even one piece — skip

    const sheetArea  = Number(s.width)       * Number(s.height);
    const usedArea   = Number(jobSize.width) * Number(jobSize.height) * ups;
    const wastage    = sheetArea - usedArea;

    const isBetter =
      ups > bestUps ||                          // strictly more copies per sheet
      (ups === bestUps && wastage < bestWastage); // same copies, less waste

    if (isBetter) {
      bestSheet   = s;
      bestUps     = ups;
      bestWastage = wastage;
    }

  }
  return { bestSheet, bestUps };
};

// FOLDS FROM FORMA
// calculate number of folds from forma (e.g. A4 → 0, A5 → 1, A6 → 2, etc.)
const calculateFoldsFromForma = (forma) => {
  if (forma <= 0) return 0;

  // ensure it's power of 2
  if ((forma & (forma - 1)) !== 0) {
    console.warn("Forma is not power of 2. Folding may be incorrect.: forma = ", forma);
  }

  return Math.log2(forma/2); 
};


// ── GRAND TOTAL HELPER ────────────────────────────────────────────────────────
const calcGrandTotal = (item, all_items, finalItemTotal) => {
  let grand = 0;
  if (Array.isArray(all_items)) {
    for (const it of all_items) {
      if (!it) continue;
      if (it.id       && item.id       && it.id       === item.id)       continue;
      if (it._temp_id && item._temp_id && it._temp_id === item._temp_id) continue;
      if (it.item_total) grand += Number(it.item_total);
    }
  }
  return grand + finalItemTotal;
};



// ── NULL SHEET HELPER ─────────────────────────────────────────────────────────
const nullSheet = () => ({
  sheet_selected: null, 
  sheet_dimensions: null, 
  ups: null,
  sheets: null, 
  sheets_with_wastage: null, 
  sheet_rate: null,
  total_sheet_cost: null, 
  printing_cost_total: null,
  printing_rate_per_sheet: null,
});



// ─────────────────────────────────────────────────────────────────────────────
// DIGITAL PRESS — maximum sheet size gate
//
// The digital press physically accepts any sheet whose:
//   short edge ≤ 13"  AND  long edge ≤ 19"
// This is orientation-independent — we compare min/max of width & height,
// so a sheet stored as 19×13 in the DB is treated the same as 13×19.
//
// Tolerance of ±0.15" covers floating-point GSM/size rounding in the DB
// (e.g. A4 stored as 8.268×11.693 still passes).
//
// To change the press capacity in the future, update only these two constants.
// ─────────────────────────────────────────────────────────────────────────────
const DIGITAL_MAX_SHORT_EDGE = 13;   // inches
const DIGITAL_MAX_LONG_EDGE  = 19;   // inches
const DIGITAL_TOLERANCE      = 0.15; // inches — absorbs DB float imprecision

/**
 * Returns true if the paper-master row can physically pass through the digital press.
 * Checks the short-edge / long-edge rule — handles portrait and landscape DB entries.
 */
const isWithinDigitalMaxSheet = (sheet) => {
  const w = Number(sheet.width);
  const h = Number(sheet.height);

  // Guard against null / zero dimensions stored in DB
  if (!w || !h || w <= 0 || h <= 0) return false;

  const shortEdge = Math.min(w, h);
  const longEdge  = Math.max(w, h);

  return (
    shortEdge <= DIGITAL_MAX_SHORT_EDGE + DIGITAL_TOLERANCE &&
    longEdge  <= DIGITAL_MAX_LONG_EDGE  + DIGITAL_TOLERANCE
  );
};


// ── GSM TO CALIPER ─────────────────────────────────────────────────────────────
// Industry-standard paper caliper (thickness per leaf).
// One leaf = one printed sheet = two pages in a book block.
// Values are offset-printing averages; vary ±5% by manufacturer.
//
// Used exclusively for book spine width calculation.
// ─────────────────────────────────────────────────────────────────────────────
const getCaliperPerLeafMm = (gsm) => {
  const g = Number(gsm) || 80;
  if (g <=  58) return 0.080;
  if (g <=  64) return 0.085;
  if (g <=  70) return 0.090;
  if (g <=  80) return 0.100;
  if (g <=  90) return 0.110;
  if (g <= 100) return 0.120;
  if (g <= 120) return 0.135;
  if (g <= 130) return 0.145;
  if (g <= 150) return 0.160;
  if (g <= 170) return 0.175;
  if (g <= 200) return 0.190;
  if (g <= 250) return 0.215;
  if (g <= 300) return 0.250;
  return 0.270; // 300+ GSM
};

/**
 * Calculates spine width in inches for a book block.
 *
 * Formula:
 *   leaves    = insidePages / 2        (one sheet = two pages)
 *   spine_mm  = leaves × caliper_mm
 *   spine_in  = spine_mm / 25.4
 *
 * @param {number} insidePages    — total page count in the book body
 * @param {number} insidePaperGsm — GSM of the primary inside paper
 * @returns {number} spine width in inches (0 if insidePages ≤ 0)
 */

const calculateSpineWidthInches = (insidePages, insidePaperGsm) => {
  const pages = Number(insidePages) || 0;
  if (pages <= 0) return 0;
  const leaves    = pages / 2;
  const caliperMm = getCaliperPerLeafMm(insidePaperGsm);
  const spineMm   = leaves * caliperMm;
  return spineMm / 25.4;
};



// MAIN CONTROLLER
export const calculateItemController = async (req, res) => {
  console.log("calculateItemController called:");

  try {
    const { item, all_items } = req.body;

    if (!item) {
      return res.status(400).json({ message: "Missing item data" });
    }

    // extract fields
    const {
      cover_paper_type,
      cover_paper_gsm,
      size,
      cover_color_scheme,
      sides, // "Single Side" or "Both Side" — applies to printing multiplication
      category,
      binding_types = [],
      quantity,
      inside_pages = 0,
      cover_pages = 0,
    } = item;

    const qty = Number(quantity);

        // Guard: qty must be a positive integer — every division downstream uses qty as denominator.
    if (!qty || qty <= 0 || !Number.isFinite(qty)) {
      return res.status(400).json({ message: "Quantity must be a positive number." });
    }

    // ── 1. Resolve job size ───
    const sizeMasterRow = await SizeMaster.findOne({
      where: {
        name: size
      }
    });


    let jobSize = {};

    if (sizeMasterRow) {
      let width = sizeMasterRow.width;
      let height = sizeMasterRow.height;

      // DB is in inches → convert if needed
      if (category === "Wide Format") {
        width = width / 12;
        height = height / 12;
        jobSize = { width, height, unit: "feet" };
      } else {
        jobSize = { width, height, unit: "inches" };
      }

    } else {
      jobSize = parseSize(size, category);
    }

    // ------------------- 1. Parse custom size -------------------
    if (!jobSize) {
      return res.status(400).json({ message: "Invalid size format" });
    }
    

    // WIDE FORMAT — find best material and calculate cost based on area or rate per pc
    if (category === "Wide Format") {

      const { wide_material_name, wide_material_gsm, wide_material_thickness, color_scheme } = item;
      const { width, height } = jobSize; // assume already in FEET

      if (!width || !height || !qty || !wide_material_name) {
        return res.status(400).json({ message: "Missing required fields for Wide Format"  });
      }

      // Fetch matching materials from WideFormatMaterial table
      const materials = await WideFormatMaterial.findAll({
        where: {
          material_name: wide_material_name,
          ...(wide_material_gsm && { gsm: wide_material_gsm }),
          ...(wide_material_thickness && { thickness_mm: wide_material_thickness }),
        }
      });


      if (!materials || materials.length === 0) {
        return res.status(404).json({ message: "Material not found" });
      }

      let bestOption = null;

      for (const mat of materials) {

 
        //  1️. STANDEE (RATE PER PC)
        if (mat.rate_per_pc) {

          if ( Number(mat.board_width_ft) === width && Number(mat.board_height_ft) === height) {
      
            const totalCost = Number(mat.rate_per_pc) * qty;
            const unitRate = Number(mat.rate_per_pc);
            bestOption = {
              type: "standee",
              totalCost,
              unitRate,
              wastage: 0,
              material: mat,
              rolls_or_boards_used: qty,
            };
          }

          continue;
        }

        //  2️. ROLL MATERIAL (FLEX/VINYL)
        if (mat.roll_width_ft && mat.rate_per_sqft) {

          const rate = Number(mat.rate_per_sqft);
          const artworkArea = width * height * qty;

          // Customer price is based on printed area × rate_per_sqft
          const materialCost = artworkArea * rate;      // what customer pays

          const option = {
            type: "roll",
            totalCost: materialCost,
            unitRate: materialCost / qty,
            artworkArea,
            wastage: 0,
            material: mat
          };

          if (!bestOption || option.totalCost < bestOption.totalCost) {   
            bestOption = option;
          }
        }

        // 3. ---------- Board material (Sunboard, ACP) – rate per sqft, fixed board size ----------
        if (mat.board_width_ft && mat.board_height_ft && mat.rate_per_sqft) {

          const board = {
            width: Number(mat.board_width_ft),
            height: Number(mat.board_height_ft)
          };
          const rateSqft = Number(mat.rate_per_sqft);

          const ups = calculateUps(board, { width, height });
          if (ups <= 0) continue; // cannot fit even one piece on this board

          const boardsNeeded = Math.ceil(qty / ups);
          const totalAreaUsed = board.width * board.height * boardsNeeded; // sqft consumed
          const artworkArea = width * height * qty;       // billable sqft
          const wastage = totalAreaUsed - artworkArea;

          // Customer price is based on printed area × rate_per_sqft
          const totalCost = artworkArea * rateSqft;
          const unitRate = totalCost / qty;          

          const option = {
            type: "board",
            totalCost,
            unitRate,
            wastage,
            boardsNeeded,
            material: mat.dataValues,
            ups,
          };

          if (!bestOption || option.ups > bestOption.ups || (option.wastage < bestOption.wastage)) {
            bestOption = option;
          }
        }
      }

      if (!bestOption) {
        return res.status(400).json({
          message: "No suitable roll/board found for given size"
        });
      }

      // Jin materials pe calculation NAHI karni hai, unki list
      const noCalcMaterials = [
        'Standee', 
        'Normal Flex', 
        'Star Flex', 
        'Star Flex BackLit', 
        'Star Vinyl', 
        'Normal Vinyl',
        'Sun Board With Vinyl',
        'Sun Board',
        'Acrylic Indiana',
        'Acrylic exported',
        'Cloth Banner',
        'ACP Board'
      ];

      // ------------------- Printing cost for wide format -------------------
      let printingCost = 0;

      // Agar material name is list ke andar mojood hai
      if (!noCalcMaterials.includes(bestOption.material.material_name)) {
        const pressType = item.press_type; // should be "FLEX MACHINE" or similar
        printingCost = await calculatePrintingCost(
          pressType,
          color_scheme,       // may be null, but per_sqft doesn't use it
          sides,
          0,                 // sheetCount not used for per_sqft
          jobSize,
          qty
        );
      }
      
    // ------------------- 7. Binding cost (applies on total qty) -------------------
    let bindingCostTotal = 0;
    if (binding_types && binding_types.length > 0) {
      // fetch all binding rows matching selected names
      const bindingRows = await BindingMaster.findAll({
        where: { 
          binding_name: binding_types,
          category: category           // 'Wide Format'
        },
      });

      // Build context for binding calculation
      const bindingContext = {        
        insidePages: Number(item.inside_pages || 0),   // default 0 for wide format
        coverPages: Number(item.cover_pages || 0),
        insideSheets: 0,  // not applicable, set to 0
        coverSheets: 0,
        ups: 1,           // not applicable, but set to 1 to avoid division issues
        size: jobSize,    // { width, height } in feet
        sides: sides,
        itemName: item.enquiry_for || '',
        creasesPerSheet: Number(item.creases_per_sheet || 0),
        foldsPersheet: Number(item.folds_per_sheet || 0)
      };

      bindingCostTotal = calculateBindingCost(bindingRows, item, qty, bindingContext);
    }

    // Update bestOption.totalCost to include binding
    const materialCost = bestOption.totalCost;
    const finalItemTotal = materialCost + printingCost + bindingCostTotal;
    const finalUnitRate = finalItemTotal / qty;



      // 🔥 calculate grand total same like normal flow
      const grandTotal = calcGrandTotal(item, all_items, finalItemTotal);

      return res.json({
        inside: nullSheet(), // not applicable for wide format
        cover: nullSheet(),  // not applicable for wide format
        wide: {
          // wide-format specific info
          selected_material: bestOption.material.material_name,
          selected_wide_material_id: bestOption.material?.id,
          calculation_type: bestOption.type,
          // 🔥 optional extra details
          details: {
            rolls_or_boards_used: bestOption.rollsNeeded || bestOption.boardsNeeded || null,
            wastage_sqft: bestOption.wastage || 0,
            ups: bestOption.ups || null,
            selected_material_info: bestOption.material, 
          },
        },

        totals: {
          // 🔥 required by frontend
          unit_rate: finalUnitRate,
          item_total: finalItemTotal,
          grand_total: grandTotal,
          // [CHANGE] expose separately so frontend can populate costing_snapshot
          material_cost:          materialCost,
          printing_cost:          printingCost,
          total_binding_cost:     bindingCostTotal,
          binding_cost_per_copy:  qty > 0 ? bindingCostTotal / qty : 0,
        },
      });
    }
    // SINGLE SHEET — only inside, no separate cover, no wide format
    if (category === "Single Sheet") {
      const { paper_type, paper_gsm, color_scheme } = item;

      if (paper_type === "Maplitho Plotter Paper" || paper_type === "Photo Plotter Paper"){
        if (item.press_type !== "PLOTTER BLACK WHITE" && item.press_type !== "PLOTTER MULTICOLOR") {
          return res.status(400).json({
            message: "Plotter paper must use Plotter Printing press"
          });
        }
        if (!["A0", "A1", "A2"].includes(size)) {
          return res.status(400).json({
            message: "Plotter paper only supports A0, A1, A2 sizes"
          });
        }
      }

      let whereCondition = { paper_name: paper_type, gsm: paper_gsm };


      // For plotter papers also match sheet size
      if ( paper_type === "Maplitho Plotter Paper" || paper_type === "Photo Plotter Paper") {
        whereCondition.size_name = size.trim().toUpperCase();
      }
      
      // ----- 2. Find paper rows for inside (or single) -----
      let insidePaperRows = await PaperMaster.findAll({
        where: whereCondition,
      });

      if (!insidePaperRows || insidePaperRows.length === 0) {
        return res.status(404).json({ 
          message: "Inside paper not found" 
        });
      }

      const pressType = (item.press_type || "").toUpperCase();  

      const isDigital = pressType === "DIGITAL MULTICOLOR" || pressType === "DIGITAL BLACK WHITE";
      // DIGITAL PRESS → only allow 12x18 and 13x19
      if (isDigital) {
        insidePaperRows = insidePaperRows.filter(isWithinDigitalMaxSheet);
        if (insidePaperRows.length === 0) {
          return res.status(404).json({
            message: `No sheet found that fits the digital press for "${paper_type}" ${paper_gsm} GSM. ` +
                    `Digital press accepts sheets up to ${DIGITAL_MAX_SHORT_EDGE}"×${DIGITAL_MAX_LONG_EDGE}".`,
          });
        }
      }

      // Expand job size by digital bleed before UPS calculation (bleed = 0 for non-digital)
      const effectiveJobSizeForUps = addDigitalBleed(jobSize, pressType);
      const { bestSheet: bestInsideSheet, bestUps: bestUpsInside } = pickBestSheet(insidePaperRows, effectiveJobSizeForUps);

      if (!bestInsideSheet || bestUpsInside === 0 || !Number.isFinite(bestUpsInside)) {
        return res.status(500).json({
          message: `No sheet large enough to fit job size ${size} was found in paper master for ${paper_type} ${paper_gsm} GSM.`,
        });
      }


      // ------ 4. Compute sheets required ------
      // UPS NEVER changes for Single Sheet
      let insideSheets = Math.ceil(qty / bestUpsInside);
      // For plotter papers there will be no wastage
      const isPlotterPaper =
        paper_type === "Maplitho Plotter Paper" ||
        paper_type === "Photo Plotter Paper";

      // Plotter paper: no wastage (pre-cut rolls). Others: press-type driven wastage.
      const wastageMultiplier = isPlotterPaper ? 1.00 : getWastageMultiplier(pressType);
      const insideSheetsWithWastage = Math.ceil(insideSheets * wastageMultiplier);

      const insideSheetRate = Number(bestInsideSheet.rate_per_sheet || 0);
      const insideTotalSheetCost = insideSheetsWithWastage * insideSheetRate;

      // --- 6. Printing cost (using press rates) ---
      let insidePrintingCostTotal = await calculatePrintingCost(
        pressType,
        color_scheme,        // color scheme for inside
        sides,
        insideSheetsWithWastage, // total sheets to print
        jobSize,
        qty,
        bestUpsInside,
        category
      );

      // Add:
      let ssPlateDetails = null;
      if (pressType === "HMT BLACK WHITE" || pressType === "HMT MULTICOLOR") {
        // For Single Sheet: forma = 1 (one unique layout per job)
        // ups here is bestUpsInside (copies per sheet, not pages per sheet)
        // For single sheet the "inside_pages" concept doesn't apply — it's just 1 forma
        const isBothSide   = sides === "Both Side" || sides === "Both Sides";
        const isMulticolor = pressType === "HMT MULTICOLOR";
        const platesPerForma = isMulticolor ? (isBothSide ? 8 : 4) : (isBothSide ? 2 : 1);
        const totalPlates    = platesPerForma; // 1 forma for single sheet jobs
        const plateCost      = totalPlates * 2000;
        ssPlateDetails = { total_plates: totalPlates, plate_cost: plateCost, forma: 1 };
        insidePrintingCostTotal += plateCost;  // add to total
      }


      let bindingCostTotal = 0;
      if (binding_types && binding_types.length > 0) {
        // fetch all binding rows matching selected names
        const bindingRows = await BindingMaster.findAll({
          where: { 
            binding_name: binding_types,
            category
          },
        });

        // Build context for binding calculation
        const bindingContext = {
          insidePages: Number(item.inside_pages || 0),
          coverPages: 0,
          insideSheets: insideSheetsWithWastage,  // total inside sheets for all copies
          coverSheets: 0,
          ups: bestUpsInside,     // copies per sheet (forma)
          size: jobSize,    // { width, height } in inches (or feet for wide)
          sides: sides,
          itemName: item.enquiry_for || '',               // to detect school copy
          creasesPerSheet: Number(item.creases_per_sheet || 0),
          foldsPersheet: Number(item.folds_per_sheet || 0),
        };

        bindingCostTotal = calculateBindingCost(bindingRows, item, qty, bindingContext);
      }

      const sheetCostPerCopy = insideTotalSheetCost / qty;
      const printingCostPerCopy = insidePrintingCostTotal / qty;
      const bindingCostPerCopy = bindingCostTotal / qty;
      const unitRate = sheetCostPerCopy + printingCostPerCopy + bindingCostPerCopy;
      const itemTotal = unitRate * qty;

      const grandTotal = calcGrandTotal(item, all_items, itemTotal);

      return res.json({
        inside: {
          selected_paper_id:   bestInsideSheet.id,
          sheet_selected:    bestInsideSheet.size_name,
          sheet_name:        bestInsideSheet.paper_name + " " + (bestInsideSheet.size_category || ""),
          sheet_dimensions:  `${bestInsideSheet.width}x${bestInsideSheet.height}`,
          ups:               bestUpsInside,
          sheets:            insideSheets,
          sheets_with_wastage: insideSheetsWithWastage,
          sheet_rate:        insideSheetRate,
          total_sheet_cost:  insideTotalSheetCost,
          printing_cost_total: insidePrintingCostTotal,
          plate_details: ssPlateDetails,
        },
        cover: nullSheet(),
        wide:  null,
        totals: {
          total_sheet_cost:      insideTotalSheetCost,
          total_printing_cost:   insidePrintingCostTotal,
          total_binding_cost:    bindingCostTotal,
          sheet_cost_per_copy:   sheetCostPerCopy,
          printing_cost_per_copy: printingCostPerCopy,
          binding_cost_per_copy: bindingCostPerCopy,
          unit_rate:             unitRate,
          item_total:            itemTotal,
          grand_total:           grandTotal,
        },
      });
    }


    // MULTIPLE SHEET
    // WHAT CHANGED vs original:
    //   Before → one inside paper: paper_type + paper_gsm at item level.
    //   Now    → item.inside_papers[] (array of 1–4 papers), each with its own paper_type, paper_gsm, to_print, color_scheme, press_type.
    //   We loop through every inside paper and:
    //     1. Look up PaperMaster rows for that paper
    //     2. Pick best sheet (highest UPS)
    //     3. Calculate sheets needed  (same formula: inside_pages × qty / ups)
    //     4. Apply 5% wastage
    //     5. Calculate sheet cost     (sheets × rate_per_sheet)
    //     6. If to_print → calculate printing cost for that paper
    //   Then sum ALL papers' sheet costs + printing costs for totalInsideCost.
    //   Cover calculation stays exactly the same as before.
    // 

    if(category === "Multiple Sheet") {
      // Guard: inside_pages = 0 would make all sheet counts 0 → divide-by-zero in unit_rate.
      if (!Number(inside_pages) || Number(inside_pages) <= 0) {
        return res.status(400).json({ message: "Inside pages must be greater than 0 for Multiple Sheet." });
      }
      // ── Resolve inside_papers ──
      // Support old single-paper payload (backward compat during transition)
      // as well as the new inside_papers[] array from the frontend.
      const insidePapers = Array.isArray(item.inside_papers) && item.inside_papers.length > 0 ? item.inside_papers : [
        // Old format fallback — map item-level fields to a single paper
            {
              paper_type:   item.paper_type,
              paper_gsm:    item.paper_gsm,
              to_print:     true,
              color_scheme: item.color_scheme,
              press_type:   item.inside_press_type || item.press_type,
            },
          ];


      const coverPressType = (item.cover_press_type  || "").toUpperCase();

      // ── Accumulators ───

      let totalInsideSheetCost    = 0;
      let totalInsidePrintingCost = 0;
      let primaryUps              = 0;   // ups of first paper — used for binding context
      let primaryInsideSheets     = 0;   // sheets of first paper — used for binding context
      let totalInsideSheetsAllPapers = 0; // sum of all papers' sheets — used for cutting binding
      // This array is stored back in the DB (inside_papers JSON column) and returned to the frontend for display in the sidebar.
      const insidePapersResults = [];

      // ── BEFORE the for loop: batch-fetch all paper master rows in parallel ──
      // Each inside paper may have a different paper_type + paper_gsm combo.
      // We fetch them all at once and map results by index.

      const paperMasterFetches = insidePapers.map((paper) => {
        if (!paper.paper_type || !paper.paper_gsm) return Promise.resolve([]);
        return PaperMaster.findAll({
          where: { paper_name: paper.paper_type, gsm: paper.paper_gsm },
        });
      });

      // Wait for all fetches in parallel — no race condition here because each
      // fetch is an independent SELECT with no writes. Sequelize connection pool
      // handles concurrent queries safely.
      const allPaperRowsRaw = await Promise.all(paperMasterFetches);

      // ── Loop: calculate every inside paper ───
      for (let i = 0; i < insidePapers.length; i++) {
        const paper = insidePapers[i];
        let paperRows  = allPaperRowsRaw[i];

        if (!paper.paper_type || !paper.paper_gsm) {
          // Skip incomplete papers — shouldn't happen if frontend validates,
          // but guard just in case.
          console.warn(`Inside paper ${i + 1} is missing paper_type or paper_gsm — skipping.`);
          continue;
        }

        if (!paperRows || paperRows.length === 0) {
          return res.status(404).json({
            message: `Inside paper ${i + 1} (${paper.paper_type} ${paper.paper_gsm} GSM) not found in paper master`,
          });
        }

        // 2. Digital press → restrict to 12×18 or 13×19 sheets
        const paperPressType = (paper.press_type || "").toUpperCase();
        const isDigitalForPaper = paperPressType === "DIGITAL MULTICOLOR" || paperPressType === "DIGITAL BLACK WHITE";

        if (paper.to_print && isDigitalForPaper) {
          paperRows = paperRows.filter(isWithinDigitalMaxSheet);
          if (paperRows.length === 0) {
            return res.status(404).json({
              message: `No digital-press compatible sheet found for inside paper ${i + 1} ` +
                      `(${paper.paper_type} ${paper.paper_gsm} GSM). ` +
                      `Digital press accepts sheets up to ${DIGITAL_MAX_SHORT_EDGE}"×${DIGITAL_MAX_LONG_EDGE}".`,
            });
          }
        }
        // Both Side Multiple Sheet → must have even UPS (sheets fold to form pages)
        const requireEvenUps = sides === "Both Side" || sides === "Both Sides";
        // 3. Pick best sheet
        // Expand job size by digital bleed for this paper's press type (0 bleed for non-digital)
        const effectiveJobSizeForUps = addDigitalBleed(jobSize, paper.press_type);

        let { bestSheet, bestUps } = pickBestSheet(paperRows, effectiveJobSizeForUps, requireEvenUps);
        if (!bestSheet || bestUps === 0 || !Number.isFinite(bestUps)) {
          return res.status(500).json({
            message: `No sheet large enough to fit job size ${size} was found for inside paper ${i + 1} ` +
                    `(${paper.paper_type} ${paper.paper_gsm} GSM).`,
          });
        }

        // 4. Adjust UPS for Both Side printing (same logic as original)
        //    Both Side → each sheet prints 2 "layers", so effective pages per sheet doubles.
        // UPS SHOULD DOUBLE for BOTH SIDE (PAGES LOGIC)
        let effectiveUps = bestUps;
        if (sides === "Both Side" || sides === "Both Sides") {
          effectiveUps = bestUps * 2;
        }

        // 5. Sheets needed for this paper
        //    Formula: ceil((inside_pages × qty) / effectiveUps)
        //    inside_pages is shared — all papers use the same page count.
        const insideTotalPages = Number(inside_pages) * qty;
        const paperSheets = Math.ceil(insideTotalPages / effectiveUps);
        
        // Wastage is 0 when paper is not sent to press (no printing = no makeready spoilage).
        // When printed: press-type driven (HMT/AUTOPRINT=10%, Digital=5%, Flex=0%).
        const paperWastageMultiplier = paper.to_print ? getWastageMultiplier(paper.press_type) : 1.00;
        const paperSheetsWithWastage = Math.ceil(paperSheets * paperWastageMultiplier);

        // 6. Sheet cost for this paper
        const sheetRate = Number(bestSheet.rate_per_sheet || 0);
        const sheetCost = paperSheetsWithWastage * sheetRate;

        // 7. Printing cost — only if to_print is true
        let printingCost = 0;
        let plateDetails = null;

        if (paper.to_print) {
          // Running press cost (slab-based)
          printingCost = await calculatePrintingCost(
            paperPressType,
            paper.color_scheme,
            sides,
            paperSheetsWithWastage,
            jobSize,
            qty,
            effectiveUps,
            category
          );
          console.log(`Paper ${i + 1}: printingCost ${printingCost}`);
        }

        // Plate cost for HMT presses — calculated from forma, NOT from UPS directly
        if (paperPressType === "HMT BLACK WHITE" || paperPressType === "HMT MULTICOLOR") {
          plateDetails  = calculateHMTPlateDetails(inside_pages, effectiveUps, sides, paperPressType);
          printingCost += plateDetails.plate_cost;
          console.log(`Paper ${i + 1}: running=${printingCost - plateDetails.plate_cost}, plates=${plateDetails.total_plates}, plateCost=${plateDetails.plate_cost}, forma=${plateDetails.forma}`);
        }

        // 8. Accumulate
        totalInsideSheetCost += sheetCost;
        totalInsidePrintingCost += printingCost;
        totalInsideSheetsAllPapers += paperSheetsWithWastage;

        // Track first paper's values for binding context (binding rules were written around a single inside paper — first paper is dominant).
        if (i === 0) {
          primaryUps = effectiveUps;
          primaryInsideSheets  = paperSheetsWithWastage;
        }

        // Build result object for this paper (saved in DB + returned to frontend)
        insidePapersResults.push({
          _id:                 paper._id || null,
          selected_paper_id:  bestSheet.id,
          to_print:            paper.to_print,
          color_scheme:        paper.color_scheme || null,
          press_type:          paper.press_type   || null,
          // Calculation details
          ups:                 bestUps,            // raw ups (before sides multiplier)
          effective_ups:       effectiveUps,
          sheets:              paperSheets,
          sheets_with_wastage: paperSheetsWithWastage,
          sheet_rate:          sheetRate,
          sheet_cost:          sheetCost,
          printing_cost:       printingCost,
          // Display-only fields — frontend uses for pills, strips before DB save
          paper_type:           paper.paper_type,
          paper_gsm:            paper.paper_gsm,
          // Display info for sidebar
          best_sheet_name:     bestSheet.paper_name + " " + (bestSheet.size_category || ""),
          best_sheet_dims:     `${bestSheet.width}x${bestSheet.height}`,
          best_sheet_size_name: bestSheet.size_name,
          plate_details: plateDetails, 
        });
      }

      // Guard: if every inside paper was skipped (all had missing paper_type/paper_gsm),
      // insidePapersResults will be empty — nothing to calculate cover against.
      if (insidePapersResults.length === 0) {
        return res.status(400).json({
          message: "No valid inside paper data found. Please ensure all inside papers have paper type and GSM set.",
        });
      }

      // Cover calculation (same as original logic, only now it's after the inside papers loop)
      let coverPaperRows = await PaperMaster.findAll({
        where: { 
          paper_name: cover_paper_type, 
          gsm: cover_paper_gsm 
        },
      });

      // fallback to insidePaperRows if none found
      if (!coverPaperRows || coverPaperRows.length === 0) {
        return res.status(404).json({ message: "Cover paper not found" });
      }

      const isDigitalCover = coverPressType === "DIGITAL MULTICOLOR" || coverPressType === "DIGITAL BLACK WHITE";

      // DIGITAL PRESS → only allow 12x18 and 13x19
      if (isDigitalCover) {
        coverPaperRows = coverPaperRows.filter(isWithinDigitalMaxSheet);
        if (coverPaperRows.length === 0) {
          return res.status(404).json({
            message: `No digital-press compatible sheet found for cover paper ` +
                    `(${cover_paper_type} ${cover_paper_gsm} GSM). ` +
                    `Digital press accepts sheets up to ${DIGITAL_MAX_SHORT_EDGE}"×${DIGITAL_MAX_LONG_EDGE}".`,
          });
        }
      }

      // ── Spine width ───────────────────────────────────────────────────────────────
      // Spine is only present when the cover wraps around the book (cover_pages === 4).
      // For a 2-page cover (front + back flat sheet, no fold), there is no spine.
      //
      // Spine width depends on the primary INSIDE paper's thickness, not the cover paper.
      // We use insidePapers[0].paper_gsm as the dominant paper for the book block.
      const primaryInsidePaperGsm = insidePapers[0]?.paper_gsm || 80;
      const spineBindings = ["pad binding", "perfect bound"];
      const hasSpine = binding_types.some(
        (b) => spineBindings.some((sb) => b.toLowerCase().includes(sb))
      );

      const spineWidthInches = hasSpine
        ? calculateSpineWidthInches(inside_pages, primaryInsidePaperGsm)
        : 0;
      const spineWidthMm = spineWidthInches * 25.4;

      // ── Cover flat size for UPS calculation ──────────────────────────────────────
      // An unfolded 4-page wrap cover lays flat as:
      //   width  = back_cover_width + spine + front_cover_width  = 2×page_width + spine
      //   height = page_height
      //
      // A 2-page cover is just the page size (no spine, no fold).

      // If spine exists → cover unfolds to: back + spine + front = 2×pageWidth + spine
      // If no spine    → cover is just the page width (single or folded flat sheet)
      const coverFlatJobSize = {
        ...jobSize,
        width: hasSpine
          ? jobSize.width * 2 + spineWidthInches
          : jobSize.width,
      };

      // Apply digital bleed on top of the cover flat size (not the raw page size)
      // Expand job size by digital bleed for the cover press type
      const effectiveCoverJobSizeForUps = addDigitalBleed(coverFlatJobSize, item.cover_press_type);

      // Cover requireEven: only when cover is 4 pages (both sides printed, folded)
      const coverRequiresEvenUps = Number(cover_pages) === 4;

      const { bestSheet: bestCoverSheet, bestUps: bestUpsCover } = pickBestSheet(coverPaperRows, effectiveCoverJobSizeForUps, coverRequiresEvenUps);

      if (!bestCoverSheet || bestUpsCover === 0 || !Number.isFinite(bestUpsCover)) {
        return res.status(400).json({
          message: `Cover flat size (${Number(coverFlatJobSize.width.toFixed(3))}" × ` +
             `${Number(coverFlatJobSize.height.toFixed(3))}" including ` +
             `${spineWidthMm.toFixed(1)}mm spine) does not fit on any ` +
             `available cover paper (${cover_paper_type} ${cover_paper_gsm} GSM).`,
        });
      }
      // ── Extract cover_to_print (default true for backward compat) ──────────
      const cover_to_print = item.cover_to_print !== false;

      // ── Cover sheet count ─────────────────────────────────────────────────────────
      // Each book copy needs exactly ONE cover sheet (one physical piece that wraps
      // around or covers the book). UPS tells us how many covers fit per press sheet.
      //
      // Old formula: ceil(2*qty / UPS) — computed as 2 "half-covers" × qty, which
      //   under-counted sheets for wrap covers and was inconsistent with UPS based
      //   on page size.
      // New formula: ceil(qty / UPS) — direct and correct.

      // const coverTotalPages = 2 * qty;    // cover is 2 pages per copy (front + back), regardless of inside page count
      
      // No spine → 2 separate page-sized pieces per book (front + back), UPS on page size
      // Has spine → 1 flat cover per book (back+spine+front), UPS on flat cover size
      const coverSheets = hasSpine
        ? Math.ceil(qty / bestUpsCover)
        : Math.ceil((2 * qty) / bestUpsCover);
      // Apply 5% wastage per sheet type (round up)

      const coverWastageMultiplier = cover_to_print ? getWastageMultiplier(item.cover_press_type) : 1.00;
      const coverSheetsWithWastage = Math.ceil(coverSheets * coverWastageMultiplier);
      const coverSheetRate = Number(bestCoverSheet.rate_per_sheet || 0);
      const coverTotalSheetCost = coverSheetsWithWastage * coverSheetRate;

      // ── Cover printing cost — ONLY when cover goes to press ───────────────
      let coverPrintingCostTotal = 0;
      if (cover_to_print) {
        if (!cover_color_scheme) {
          return res.status(400).json({
            message: "Cover color scheme is required when cover is sent to press",
          });
        }
        if (!coverPressType || coverPressType === "") {
          return res.status(400).json({
            message: "Cover press machine is required when cover is sent to press",
          });
        }
        coverPrintingCostTotal = await calculatePrintingCost(
          coverPressType,
          cover_color_scheme,
          Number(cover_pages) === 4 ? "Both Side" : "Single Side",
          coverSheetsWithWastage,
          // Printing cost is based on the FLAT cover size (what the press actually prints).
          // We pass coverFlatJobSize here (no bleed — bleed is only for UPS slot fitting).
          coverFlatJobSize,
          qty,
          bestUpsCover,
          category,
          true,  // coverFlag
        );
      }

      // ── Cover plate cost — HMT presses only ──────────────────────────────────────
      // Cover is 1 forma. 2-page = Single Side, 4-page = Both Side.
      // Plate cost is added on top of the running press slab cost calculated above.
      let coverPlateDetails = null;
      if (
        cover_to_print &&
        (coverPressType === "HMT BLACK WHITE" || coverPressType === "HMT MULTICOLOR")
      ) {
        coverPlateDetails     = calculateCoverPlateDetails(cover_pages, coverPressType);
        coverPrintingCostTotal += coverPlateDetails.plate_cost;
      }


      // ── Total sheet cost ──
      const totalSheetCost = totalInsideSheetCost + coverTotalSheetCost;
      const totalPrintingCost = totalInsidePrintingCost + coverPrintingCostTotal;
      // ── Binding cost ───
      // For binding context:
      // insideSheets = totalInsideSheetsAllPapers  (used for cutting slabs, etc.)
      // ups = primaryUps    (first paper's ups for folding/stitching)
      // --- 7. Binding cost (applies on total qty) ---
      let bindingCostTotal = 0;
      if (binding_types && binding_types.length > 0) {
        // fetch all binding rows matching selected names
        const bindingRows = await BindingMaster.findAll({
          where: { 
            binding_name: binding_types,
            category
          },
        });

        const bindingTargets = item.binding_targets || {};
        const numberingPaperIds   = bindingTargets.numbering_paper_ids   || [];
        const perforationPaperIds = bindingTargets.perforation_paper_ids || [];

        // Count how many inside papers are targeted
        // (for single-paper jobs, default to 1 — backwards compat)
        const numberingPaperCount = insidePapers.length <= 1 ? 1 : Math.max(numberingPaperIds.length, 1);   // guard: at least 1 if binding is checked
        const perforationPaperCount = insidePapers.length <= 1 ? 1 : Math.max(perforationPaperIds.length, 1);

        // Build context for binding calculation
        const bindingContext = {
          insidePages: Number(item.inside_pages),
          coverPages: Number(item.cover_pages),
          insideSheets: totalInsideSheetsAllPapers, // ← sum of ALL inside papers' sheets
          coverSheets: coverSheets || 0,
          ups: primaryUps,                          // copies per sheet (forma)
          size: jobSize,                                // { width, height } in inches (or feet for wide)
          sides: sides,
          itemName: item.enquiry_for || '',               // to detect school copy
          creasesPerSheet: Number(item.creases_per_sheet || 0),
          foldsPersheet: Number(item.folds_per_sheet || 0),
          numInsidePapers: insidePapers.length,        // ← for interleaf
          numberingPaperCount,                               // ← for numbering
          perforationPaperCount,                             // ← for perforation
        };

        bindingCostTotal = calculateBindingCost(bindingRows, item, qty, bindingContext);
      }

      // ── Unit rate & item total ───
      const sheetCostPerCopy = totalSheetCost    / qty;
      const printingCostPerCopy = totalPrintingCost / qty;
      const bindingCostPerCopy = bindingCostTotal  / qty;
      const unitRate = sheetCostPerCopy + printingCostPerCopy + bindingCostPerCopy;
      const itemTotal = unitRate * qty;

      // ── Grand total (sum all job items) ──
      const grandTotal = calcGrandTotal(item, all_items, itemTotal);

      // ── Response ──────────────────────────────────────────────────────────
      // `inside` → first paper's data for backward compat with frontend display.
      // `inside_papers_results` → full array for sidebar and DB storage.
      const firstPaperResult = insidePapersResults[0] || {};

      return res.json({
        // First paper info (backward compat — frontend reads data.inside for display)
        inside: {
          sheet_selected: firstPaperResult.best_sheet_size_name || null,
          sheet_name: firstPaperResult.best_sheet_name || null,
          sheet_dimensions: firstPaperResult.best_sheet_dims || null,
          ups: firstPaperResult.effective_ups || null,
          sheets: firstPaperResult.sheets || null,
          sheets_with_wastage: firstPaperResult.sheets_with_wastage || null,
          sheet_rate: firstPaperResult.sheet_rate || null,
          total_sheet_cost: firstPaperResult.sheet_cost || null,
          printing_cost_total: firstPaperResult.printing_cost || null,
          plate_details: insidePapersResults[0]?.plate_details || null,
        },

        // Full inside papers array — for sidebar display + DB storage
        inside_papers_results: insidePapersResults,


        cover: {
          // selected_paper_id added — used by frontend to build costing_snapshot.ms_cover_paper_id
          selected_paper_id:   bestCoverSheet ? bestCoverSheet.id : null,
          to_print:            cover_to_print,   // ← ADD: frontend uses to show state
          sheet_name: bestCoverSheet ? bestCoverSheet.paper_name + " " + (bestCoverSheet.size_category || "") : null,
          sheet_selected:      bestCoverSheet ? bestCoverSheet.size_name : null,
          sheet_dimensions:    bestCoverSheet ? `${bestCoverSheet.width}x${bestCoverSheet.height}` : null,
          ups:                 bestUpsCover,
          sheets:              coverSheets,
          sheets_with_wastage: coverSheetsWithWastage,
          sheet_rate:          coverSheetRate,
          total_sheet_cost:    coverTotalSheetCost,
          printing_cost_total: coverPrintingCostTotal,
          // ── Spine data — used by frontend sidebar and production card ─────────────
          spine_width_mm:      parseFloat(spineWidthMm.toFixed(2)),
          spine_width_inches:  parseFloat(spineWidthInches.toFixed(4)),
          cover_flat_width_inches: parseFloat(coverFlatJobSize.width.toFixed(4)),
          plate_details:           coverPlateDetails,
        },

        wide: null,

        totals: {
          // Per-paper breakdown (useful for audit/sidebar)
          inside_papers_count:         insidePapersResults.length,
          total_inside_sheet_cost:     totalInsideSheetCost,
          total_inside_printing_cost:  totalInsidePrintingCost,
          // Overall
          total_sheet_cost:            totalSheetCost,
          total_printing_cost:         totalPrintingCost,
          total_binding_cost:          bindingCostTotal,
          sheet_cost_per_copy:         sheetCostPerCopy,
          printing_cost_per_copy:      printingCostPerCopy,
          binding_cost_per_copy:       bindingCostPerCopy,
          unit_rate:                   unitRate,
          item_total:                  itemTotal,
          grand_total:                 grandTotal,
        },
      });

    }

    // const totalSheetsWithWastage = insideSheetsWithWastage + coverSheetsWithWastage;
    // Fallback — should never reach here
    return res.status(400).json({ message: "Unknown category" });
    
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
// context: { insidePages, insideSheets, coverSheets, ups, size, sides, itemName, creasesPerSheet }

const calculateBindingCost = (bindingRows, item, qty, context) => {
  let total = 0;
  const {
    insidePages,
    insideSheets,
    coverSheets,
    ups,
    size,
    sides,
    itemName,
    creasesPerSheet,
    foldsPersheet,
    numInsidePapers = 1,          // ← NEW
    numberingPaperCount = 1,      // ← NEW: how many papers have numbering
    perforationPaperCount = 1,    // ← NEW: how many papers have perforation
  } = context;


  for (const b of bindingRows) {
    const name = b.binding_name.toLowerCase();
    const rate = Number(b.rate_per_unit || 0);
    const unit = b.unit;
    let cost = 0;

    // ----- Side Pin + Gum Pasting (combined) -----
    if (name.includes('side pin') && name.includes('gum pasting')) {
      if (item.category === 'Multiple Sheet') {
        if (insidePages <= 100) cost = 5 * qty;
        else if (insidePages <= 200) cost = 7 * qty;
        else cost = 10 * qty;
      } else if (item.category === 'Single Sheet') {
        cost = qty * 1; // ₹1 per copy
      }
    }
    // ----- Top Pin + Gum Pasting (combined) -----
    else if (name.includes('top pin') && name.includes('gum pasting')) {
      if (item.category === 'Multiple Sheet') {
        if (insidePages <= 100) cost = 5 * qty;
        else if (insidePages <= 200) cost = 7 * qty;
        else cost = 10 * qty;
      } else if (item.category === 'Single Sheet') {
        cost = qty * 1;
      }
    }
    // ----- Cutting -----
    else if (name.includes('cutting')) {
      if (item.category === 'Multiple Sheet') {
        const totalSheets = insideSheets + (coverSheets || 0);
        // Rule 1: per 500 sheets slab ₹50
        const sheetSlabs = Math.ceil(totalSheets / 500);
        const sheetCost = sheetSlabs * 50;
        // Rule 2: quantity slabs
        let qtyCost = 0;
        if (qty <= 500) qtyCost = qty * 2;
        else if (qty <= 2000) qtyCost = qty * 1.5;
        else qtyCost = qty * 1;
        cost = sheetCost + qtyCost;
      } else if (item.category === 'Single Sheet') {
        cost = rate * qty; // ₹1 per copy
      } else {
        // fallback to per_copy from DB
        cost = rate * qty;
      }
    }
    // ----- Matt Lamination / Gloss Lamination -----
    else if (name.includes('matt lamination') || name.includes('gloss lamination')) {
      // Determine lamination sides from binding name
      const isBothSides = name.includes('(both side)');
      const isSingleSide = name.includes('(single side)');

      // If the binding name doesn't specify side (shouldn't happen), fallback to item.sides? 
      // But per your data it always does, so we proceed.

      const isSchoolCopy = itemName && itemName.toLowerCase().includes('exercise copy');

      if (isSchoolCopy) {
        // School copy special rate: ₹4 per copy (assume single side? but probably both sides? We'll use the given rate)
        if(isSingleSide){
          cost = 4 * qty;
        }
        else if(isBothSides){
          cost = 8 * qty; // double the single side rate for both sides
        }
      } else if (item.category === 'Multiple Sheet') {
        // Determine if size ≤ A5 (roughly 5.8" x 8.3" → area ~48 sq in)
        const area = (size.width * size.height) || 0;
        const isUpToA5 = area <= 48.14; // adjust if needed
        let ratePerCopy = 0;
        if (isSingleSide) {
          ratePerCopy = isUpToA5 ? 4 : 6;
        } else if (isBothSides) {
          ratePerCopy = isUpToA5 ? 8 : 12; // double the single side rates
        }
        cost = ratePerCopy * qty;
      } else if (item.category === 'Single Sheet') {
        // Single sheet rates: single side = 4, both side = 8
        let ratePerCopy = 0;
        if (isSingleSide) {
          ratePerCopy = 4;
        } else if (isBothSides) {
          ratePerCopy = 8;
        }
        cost = ratePerCopy * insideSheets;
      } else if (item.category === 'Wide Format') {
        // Wide format: rate per sqft (₹5) – side doesn't matter
        const area = size.width * size.height; // in feet
        cost = area * 5 * qty;
      }
    }
    // ----- Creasing -----
    else if (name.includes('creasing')) {
      if (item.category === 'Multiple Sheet') {
        cost = 2 * 0.25 * qty;
      }else{
        const totalCreases = creasesPerSheet * insideSheets; // total creases for all sheets
        cost = totalCreases * rate; // ₹0.25 per crease
      }
    }
    // ----- Centre Pin -----
    else if (name.includes('centre pin')) {
      if (item.category === 'Multiple Sheet') {
        cost = qty * 5;
      }
    }
    // ----- Spiral Binding -----
    else if (name.includes('spiral')) {
      if (item.category === 'Multiple Sheet') {
        if (qty < 100) cost = qty * 50;
        else cost = qty * 30;
      }
    }
    // ----- Wiro Bound -----
    else if (name.includes('wiro')) {
      if (item.category === 'Multiple Sheet') {
        if (qty < 100) cost = qty * 70;
        else cost = qty * 30;
      }
          // ----- Calendar Wiro Bound -----
      else if (item.category === 'Single Sheet') {
        if(name.includes('calendar')){
          cost = qty * rate; // rate from DB 20
        }
      }
    }
    // ----- Perfect Bound -----
    else if (name.includes('perfect bound')) {
      if (item.category === 'Multiple Sheet') {
        cost = qty * 20;
      }
    }
    // ----- Pad Binding -----
    else if (name.includes('pad binding')) {
      if (item.category === 'Multiple Sheet') {
        cost = qty * 2;
      }
    }
    // ----- Numbering -----
    else if (name.includes('numbering')) {
      if (item.category === 'Multiple Sheet') {
        const totalPages = insidePages * numberingPaperCount * qty;
        const slabs = Math.ceil(totalPages / 500);
        cost = slabs * rate;
      }

    }
    // ----- Interleaf -----
    else if (name.includes('interleaf')) {
      if (item.category === 'Multiple Sheet') {
        const totalPages = insidePages * numInsidePapers * qty;
        const slabs = Math.ceil(totalPages / 500);
        cost = slabs * rate;
      }

    }
    // ----- Perforation -----
    else if (name.includes('perforation')) {
      if (item.category === 'Multiple Sheet') {
        const totalPages = insidePages * perforationPaperCount * qty;
        const slabs = Math.ceil(totalPages / 500);
        cost = slabs * rate;
      }
    }
    // ----- Hard Bound -----
    else if (name.includes('hard bound')) {
      if (item.category === 'Multiple Sheet') {

        // Total pages including multiple inside papers
        const totalPages = insidePages * numInsidePapers;
        // Number of 100-page slabs
        const slabs = Math.ceil(totalPages / 100);
        // ✅ Determine size category
        const area = size.width * size.height;
        let baseRate = 0;

        // Approx A5 ≈ 48 sq in, A4 ≈ 97 sq in
        if (area <= 48.22) {
          baseRate = rate; // upto A5 50rs
        } else if (area <= 97) {
          baseRate = rate + 30; // A4 80rs 
        } else {
          baseRate = rate * 2; // bigger than A4 100rs
        }

        // First 100 pages + remaining slabs
        if (slabs === 1) {
          cost = baseRate * qty;
        } else {
          cost = (baseRate + (slabs - 1) * 30) * qty;
        }
      }
    }

    // ----- Tin Mounting -----
    else if (name.includes('tin mounting')) {
      if (item.category === 'Single Sheet') {
        cost = rate * qty; // rate from DB (3 or 6)
      }
    }
    // ----- Plotter Cutting -----
    else if (name.includes('plotter cutting')) {
      if (item.category === 'Single Sheet' || item.category === 'Wide Format') {
        cost = 50 * qty;
      }
    }
    // ----- Eyelet -----
    else if (name.includes('eyelet')) {
      if (item.category === 'Wide Format') {
        cost = 1 * qty;
      }
    }
    // ----- Designing -----
    else if (name.includes('designing')) {
      const hours = item.designing_hours || 1; // default 1 hour
      cost = 500 * hours;
    }
    // ----- Folding -----
    else if (name.includes('folding')) {
      // For multiple sheet: forma = total sheets (insideSheets)
      // For single sheet: forma = qty * (sides multiplier)
      if (item.category === 'Multiple Sheet') {
        if(sides === "Single Side"){
          cost = 0; // no folding needed for single side printing because there will be direct cutting without folding
        }
        else{
          console.log("Calculating folding cost for Multiple Sheet...ups: ", ups, ", insideSheets: ", insideSheets);
          const foldsPersheet = calculateFoldsFromForma(ups);
          const totalFolds = foldsPersheet * insideSheets;
          console.log("foldsPerSheet: ", foldsPersheet, ", totalFolds: ", totalFolds);
          cost = totalFolds * 0.20;
        }
      } else if (item.category === 'Single Sheet') {
        if(sides === "Single Side"){
          cost = 0; // no folding needed for single side printing because there will be direct cutting without folding
        }
        else{
          // need to write (no of folding will be sent from frontend same as creases per sheet)
          const totalFolds = foldsPersheet * insideSheets;
          cost = totalFolds * rate;
        }
        
      }
    }
    // ----- Stitching -----
    else if (name.includes('stitching')) {
      if (item.category === 'Multiple Sheet') {
        const totalForma = (insidePages * qty) / ups; // total forma across all copies
        cost = totalForma * 0.50;
      }
    }
    // ----- Sewing -----
    else if (name.includes('sewing')) {
      if (item.category === 'Multiple Sheet') {
        const totalForma = (insidePages * qty) / ups; // total forma across all copies
        cost = totalForma * 1;
      }
    }
    // ----- Default: use unit-based calculation -----
    else {
      switch (unit) {
        case 'per_copy':
          cost = rate * qty;
          break;
        case 'per_page':
          cost = rate * insidePages * qty;
          break;
        case 'flat':
          cost = rate * qty;
          break;
        case 'per_hour':
          cost = rate * (item.designing_hours || 1);
          break;
        case 'per_100_pages':
          {
            const blocks = Math.ceil(insidePages / 100);
            cost = rate * blocks * qty;
          }
          break;
        case 'per_forma':
          {
            let formaCount;
            if (item.category === 'Multiple Sheet') {
              formaCount = insideSheets;
            } else if (item.category === 'Single Sheet') {
              formaCount = qty * (sides === 'Both Side' || sides === 'Both Sides' ? 2 : 1);
            } else {
              formaCount = qty; // fallback
            }
            cost = rate * formaCount;
          }
          break;
        case 'per_sqft':
          {
            const area = size.width * size.height; // assume feet for wide
            cost = rate * area * qty;
          }
          break;
        default:
          cost = rate * qty;
      }
    }

    total += cost;
  }

  return total;
};




// ── HMT PLATE DETAILS ─────────────────────────────────────────────────────────
// Rules:
//   Multicolor (CMYK): Single Side = 4 plates/forma, Both Side = 8 plates/forma
//   B&W:               Single Side = 1 plate/forma,  Both Side = 2 plates/forma
//   If forma has remainder → add 4 extra plates (Multicolor) or 1 (B&W)
//   Rate = ₹2000 per plate

const calculateHMTPlateDetails = (insidePages, ups, sides, pressType) => {
  const PLATE_RATE  = 2000;
  const isMulticolor = pressType === "HMT MULTICOLOR";
  const isBothSide = sides === "Both Side" || sides === "Both Sides";
  const platesPerForma = isMulticolor
    ? (isBothSide ? 8 : 4)
    : (isBothSide ? 2 : 1);

  const rawForma = Number(insidePages) / Number(ups);
  const wholeForma = Math.floor(rawForma);
  const hasDecimal = (Number(insidePages) % Number(ups)) > 0;

  // Partial forma needs extra plates for the leftover pages
  const extraPlates = hasDecimal ? (isMulticolor ? 4 : 1) : 0;
  const totalPlates = (wholeForma * platesPerForma) + extraPlates;
  const plateCost = totalPlates * PLATE_RATE;

  return {
    total_plates: totalPlates,
    plate_cost: plateCost,
    forma: parseFloat(rawForma.toFixed(4)),
    whole_forma: wholeForma,
    plates_per_forma: platesPerForma,
    has_decimal_forma: hasDecimal,
    extra_plates: extraPlates,
    plate_rate: PLATE_RATE,
  };
};

// ── COVER PLATE DETAILS ───────────────────────────────────────────────────────
// Cover is always exactly 1 forma — no partial formas possible.
// What changes is only how many sides are printed:
//   2-page cover → Single Side → 1 forma × (4 or 1) plates
//   4-page cover → Both Side  → 1 forma × (8 or 2) plates
// Rate = ₹2000 per plate (same as inside)
// 

const calculateCoverPlateDetails = (coverPages, pressType) => {
  const PLATE_RATE   = 2000;
  const isMulticolor = pressType === "HMT MULTICOLOR";
  const isBothSide   = Number(coverPages) === 4; // 4-page = both sides printed

  // 2-page: Single Side → 4 plates (MC) or 1 plate (BW)
  // 4-page: Both Side   → 8 plates (MC) or 2 plates (BW)
  const totalPlates = isMulticolor
    ? (isBothSide ? 8 : 4)
    : (isBothSide ? 2 : 1);

  return {
    total_plates:  totalPlates,
    plate_cost:    totalPlates * PLATE_RATE,
    forma:         1,                                          // cover is always 1 forma
    cover_sides:   isBothSide ? "Both Side" : "Single Side",
    plate_rate:    PLATE_RATE,
  };
};

// ---------------------- PRINT COST (Color Based) ----------------------
// Helper to calculate printing cost based on press type, color, sides, and sheet count
const calculatePrintingCost = async (pressType, colorScheme, sides, sheetCount, jobSize, qty, ups = null, category = null, coverFlag = false) => {
  console.log("calculatePrintingCost coverFlag: ", coverFlag);

  if (!pressType) return 0;

  const rates = await PrintingRateMaster.findAll({ where: { press_type: pressType } });
  if (!rates.length) return 0;

  const sideMultiplier = (sides === 'Both Side' || sides === 'Both Sides') ? 2 : 1;
  const rateType = rates[0].rate_type; // assume all rows for same press have same type

  if (rateType === 'per_sqft') {
    // Flex machine
    const area = jobSize.width * jobSize.height;
    return area * qty * rates[0].rate * sideMultiplier;
  }

  if (rateType === 'per_sheet') {
    // Digital printing
    const rate = rates[0].rate;
    console.log("rate for digital: ", rate);
    return rate * sheetCount * sideMultiplier;
  }
  
  if (rateType === "slab") {
    // let plateCost = 0;
    // let pagesPerPlate = ups;
    // if(coverFlag === false && category === "Multiple Sheet" && sides === "Both Side"){
    //     pagesPerPlate = ups ? ups / 2 : 0;
    // }
    // if(coverFlag && category === "Multiple Sheet" && sides === "Both Side"){
    //     pagesPerPlate = ups || 0;
    // }
    

    // if(pressType === "HMT BLACK WHITE"){  
    //   plateCost = 150 * pagesPerPlate;
    // }
    // else if(pressType === "HMT MULTICOLOR"){
    //   plateCost = 750 * pagesPerPlate;
    // }


    // 1 plate 2000 multicolor
    // 1 plate hi use hota hai 2000 black and white 


    const slab = rates.find(r => r.min_qty === 1);
    if (!slab) return 0;

    const rate = Number(slab.rate);
    let sheets = sheetCount;
    let slabs = Math.floor(sheets / 1000);
    let remainder = sheets % 1000;
    // rounding rule
    if (remainder >= 100) slabs += 1;
    // minimum charge
    if (slabs === 0) slabs = 1;

    // Running press cost only — plate cost is added by the caller
    return slabs * rate * sideMultiplier;
  }

  if(rateType === "per_size"){
    if(jobSize.width === 16.54 && jobSize.height === 23.39){    // FOR A2 SIZE
      const rate = Number( Math.abs(rates[0].rate));
      console.log("A2 rate for ", pressType , ": ", rate);
      return rate * qty;
    }
    else if(jobSize.width === 23.39 && jobSize.height === 33.11){         // FOR A1 SIZE
      if(colorScheme === "Black and White"){
        const rate = Number( Math.abs(rates[0].rate)) + 20;
        console.log("A2 rate for ", pressType , ": ", rate);
        return rate * qty;
      }
      else{
        const rate = Number( Math.abs(rates[0].rate)) + 160;
        console.log("A2 rate for ", pressType , ": ", rate);
        return rate * qty;
      }

    } 
    else if(jobSize.width === 33.11 && jobSize.height === 46.81){         // FOR A0 SIZE
      if(colorScheme === "Black and White"){
        const rate = Number( Math.abs(rates[0].rate)) + 140;
        console.log("A0 rate for ", pressType , ": ", rate);
        return rate * qty;
      }
      else{
        const rate = Number( Math.abs(rates[0].rate)) + 480;
        console.log("A0 rate for ", pressType , ": ", rate);
        return rate * qty;
      }
    }
  }


  return 0;
};







