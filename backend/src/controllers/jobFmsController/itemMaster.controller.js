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

// ---------------------- UPS CALCULATION ----------------------
// How many job-size pieces fit on one sheet (try normal + rotated orientation)
const calculateUps = (sheet, job) => {
  console.log("calculateUps called: sheet", sheet);
  const normal =
    Math.floor(sheet.width / job.width) * Math.floor(sheet.height / job.height);

  const rotated =
    Math.floor(sheet.width / job.height) * Math.floor(sheet.height / job.width);

  const ups = Math.max(normal, rotated);
  if (ups === 0) return 0; // cannot fit even one piece
  return ups;
};

// ---------------------- BEST SHEET PICKING ----------------------
// Given a list of paper rows and the job size, returns the sheet with the highest UPS (most efficient fit).
const pickBestSheet = (paperRows, jobSize) => {
  console.log("Pick best sheet called:");
  let bestSheet = null;
  let bestUps = 0;
  let bestWastage = Infinity;

  for (const s of paperRows) {
    const ups = calculateUps({ width: s.width, height: s.height }, jobSize);
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
    console.warn("Forma is not power of 2. Folding may be incorrect.");
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




// MAIN CONTROLLER
export const calculateItemController = async (req, res) => {
  console.log("calculateItemController called:");

  try {
    const { item, all_items } = req.body;

    console.log("item received for calculation: ", item);
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

      console.log("bestOption: ", bestOption);

      console.log("bindingCostTotal: ", bindingCostTotal);
      console.log("printingCost: ", printingCost);
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
        insidePaperRows = insidePaperRows.filter(
          s =>
            (Number(s.width) === 12 && Number(s.height) === 18) ||
            (Number(s.width) === 13 && Number(s.height) === 19)
        );
      }
      
      const { bestSheet: bestInsideSheet, bestUps: bestUpsInside } = pickBestSheet(insidePaperRows, jobSize);


      if (!bestInsideSheet || !bestUpsInside) {
        return res.status(500).json({ 
          message: "Inside sheet / UPS selection failed" 
        });
      }

      // ------ 4. Compute sheets required ------
      // UPS NEVER changes for Single Sheet
      let insideSheets = Math.ceil(qty / bestUpsInside);
      // For plotter papers there will be no wastage
      const isPlotterPaper =
        paper_type === "Maplitho Plotter Paper" ||
        paper_type === "Photo Plotter Paper";

      const insideSheetsWithWastage = isPlotterPaper ? insideSheets : Math.ceil(insideSheets * 1.05);
      const insideSheetRate = Number(bestInsideSheet.rate_per_sheet || 0);
      const insideTotalSheetCost = insideSheetsWithWastage * insideSheetRate;

      // --- 6. Printing cost (using press rates) ---
      const insidePrintingCostTotal = await calculatePrintingCost(
        pressType,
        color_scheme,        // color scheme for inside
        sides,
        insideSheetsWithWastage, // total sheets to print
        jobSize,
        qty,
        bestUpsInside,
        category
      );

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

      // ── Loop: calculate every inside paper ───
      for (let i = 0; i < insidePapers.length; i++) {
        const paper = insidePapers[i];

        if (!paper.paper_type || !paper.paper_gsm) {
          // Skip incomplete papers — shouldn't happen if frontend validates,
          // but guard just in case.
          console.warn(`Inside paper ${i + 1} is missing paper_type or paper_gsm — skipping.`);
          continue;
        }

        // 1. Fetch matching paper rows from PaperMaster
        let paperRows = await PaperMaster.findAll({
          where: { 
            paper_name: paper.paper_type, 
            gsm: paper.paper_gsm 
          },
        });

        if (!paperRows || paperRows.length === 0) {
          return res.status(404).json({
            message: `Inside paper ${i + 1} (${paper.paper_type} ${paper.paper_gsm} GSM) not found in paper master`,
          });
        }

        // 2. Digital press → restrict to 12×18 or 13×19 sheets
        const paperPressType = (paper.press_type || "").toUpperCase();
        const isDigitalForPaper = paperPressType === "DIGITAL MULTICOLOR" || paperPressType === "DIGITAL BLACK WHITE";

        if (paper.to_print && isDigitalForPaper) {
          paperRows = paperRows.filter(
            s =>
              (Number(s.width) === 12 && Number(s.height) === 18) ||
              (Number(s.width) === 13 && Number(s.height) === 19)
          );
          if (paperRows.length === 0) {
            return res.status(404).json({
              message: `No 12x18 / 13x19 sheet found for inside paper ${i + 1} with digital press`,
            });
          }
        }

        // 3. Pick best sheet
        let { bestSheet, bestUps } = pickBestSheet(paperRows, jobSize);
        if (!bestSheet || !bestUps) {
          return res.status(500).json({
            message: `Sheet / UPS selection failed for inside paper ${i + 1} (${paper.paper_type})`,
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
        const paperSheetsWithWastage = Math.ceil(paperSheets * 1.05);

        console.log(`Paper ${i + 1}: bestSheet ${bestSheet.size_name}, bestUps ${bestUps}, effectiveUps ${effectiveUps}, paperSheets ${paperSheets}, paperSheetsWithWastage ${paperSheetsWithWastage}`);

        // 6. Sheet cost for this paper
        const sheetRate = Number(bestSheet.rate_per_sheet || 0);
        const sheetCost = paperSheetsWithWastage * sheetRate;
        
        console.log(`Paper ${i + 1}: sheetCost ${sheetCost}`);

        // 7. Printing cost — only if to_print is true
        let printingCost = 0;
        if (paper.to_print) {
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
        coverPaperRows = coverPaperRows.filter(
          s =>
            (Number(s.width) === 12 && Number(s.height) === 18) ||
            (Number(s.width) === 13 && Number(s.height) === 19)
        );
      }

      const { bestSheet: bestCoverSheet, bestUps: bestUpsCover } = pickBestSheet(coverPaperRows, jobSize);
      if(bestUpsCover === 0){
        return res.status(400).json({
            message: "Client Size does not fit the Cover Paper.!",
          });
      }
      // ── Extract cover_to_print (default true for backward compat) ──────────
      const cover_to_print = item.cover_to_print !== false;

      const coverTotalPages = Number(cover_pages) * qty;
      const coverSheets = Math.ceil(coverTotalPages / bestUpsCover);
      // Apply 5% wastage per sheet type (round up)
      const coverSheetsWithWastage = Math.ceil(coverSheets * 1.05);
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
          jobSize,
          qty,
          bestUpsCover,
          category,
          true,  // coverFlag
        );
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

      console.log("totalInsideSheetCost:   ", totalInsideSheetCost);
      console.log("totalInsidePrintingCost:", totalInsidePrintingCost);
      console.log("coverTotalSheetCost:    ", coverTotalSheetCost);
      console.log("coverPrintingCostTotal: ", coverPrintingCostTotal);
      console.log("bindingCostTotal:       ", bindingCostTotal);
      console.log("unitRate:               ", unitRate);
      console.log("insidePapersResults:    ", insidePapersResults);
      console.log("totalInsideSheetsAllPapers: ", totalInsideSheetsAllPapers);

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
        },

        // Full inside papers array — for sidebar display + DB storage
        inside_papers_results: insidePapersResults,


        cover: {
          // selected_paper_id added — used by frontend to build costing_snapshot.ms_cover_paper_id
          selected_paper_id:   bestCoverSheet ? bestCoverSheet.id : null,
          to_print:            cover_to_print,   // ← ADD: frontend uses to show state
          sheet_selected:      bestCoverSheet ? bestCoverSheet.size_name : null,
          sheet_dimensions:    bestCoverSheet ? `${bestCoverSheet.width}x${bestCoverSheet.height}` : null,
          ups:                 bestUpsCover,
          sheets:              coverSheets,
          sheets_with_wastage: coverSheetsWithWastage,
          sheet_rate:          coverSheetRate,
          total_sheet_cost:    coverTotalSheetCost,
          printing_cost_total: coverPrintingCostTotal,
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

  // console.log("Calculating binding cost with context: ", context);
  // console.log("Binding rows: ", bindingRows);
  // console.log("Quantity: ", qty);
  // console.log("Item name: ", item);

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
        console.log("Total sheets for cutting: ", totalSheets, " → slabs: ", sheetSlabs);
        const sheetCost = sheetSlabs * 50;
        console.log("Cutting cost based on sheet slabs: ", sheetCost);
        // Rule 2: quantity slabs
        let qtyCost = 0;
        if (qty <= 500) qtyCost = qty * 2;
        else if (qty <= 2000) qtyCost = qty * 1.5;
        else qtyCost = qty * 1;
        console.log("Cutting cost based on quantity slabs: ", qtyCost);
        cost = sheetCost + qtyCost;
      } else if (item.category === 'Single Sheet') {
        cost = rate * qty; // ₹1 per copy
      } else {
        // fallback to per_copy from DB
        cost = rate * qty;
      }
      console.log("cuttingCostTotal: ", cost);
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
        console.log(`Numbering: ${numberingPaperCount} paper(s), ${totalPages} total pages, ${slabs} slabs → ₹${cost}`);
      }

    }
    // ----- Interleaf -----
    else if (name.includes('interleaf')) {
      if (item.category === 'Multiple Sheet') {
        const totalPages = insidePages * numInsidePapers * qty;
        const slabs = Math.ceil(totalPages / 500);
        cost = slabs * rate;
        console.log(`Interleaf: ${numInsidePapers} paper(s), ` + `${totalPages} total pages, ${slabs} slabs → ₹${cost}`);
      }

    }
    // ----- Perforation -----
    else if (name.includes('perforation')) {
      if (item.category === 'Multiple Sheet') {
        const totalPages = insidePages * perforationPaperCount * qty;
        const slabs = Math.ceil(totalPages / 500);
        cost = slabs * rate;
        console.log(`Perforation: ${perforationPaperCount} paper(s), ${totalPages} total pages, ${slabs} slabs → ₹${cost}`);
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

        console.log(`Hard Bound: totalPages=${totalPages}, slabs=${slabs}, baseRate=${baseRate}, totalCost=${cost}`);
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
          const foldsPersheet = calculateFoldsFromForma(ups);
          console.log("foldsPerSheet: ", foldsPersheet);
          const totalFolds = foldsPersheet * insideSheets;
          console.log("totalFolds: ", totalFolds);
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

// ---------------------- PRINT COST (Color Based) ----------------------
// Helper to calculate printing cost based on press type, color, sides, and sheet count
const calculatePrintingCost = async (pressType, colorScheme, sides, sheetCount, jobSize, qty, ups = null, category = null, coverFlag = false) => {
  console.log("pressType: ", pressType, ", colorScheme: ", colorScheme, ", sides: " , sides, " , sheetCount: ", sheetCount, ", jobSize: ", jobSize, ", qty: ", qty, ", ups: ", ups, "coverFlag: ", coverFlag);

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
    let plateCost = 0;
    let pagesPerPlate = ups;
    if(coverFlag === false && category === "Multiple Sheet" && sides === "Both Side"){
        pagesPerPlate = ups ? ups / 2 : 0;
    }
    if(coverFlag && category === "Multiple Sheet" && sides === "Both Side"){
        pagesPerPlate = ups ? ups / 2 : 0;
    }
    

    if(pressType === "HMT BLACK WHITE"){  
      plateCost = 150 * pagesPerPlate;
    }
    else if(pressType === "HMT MULTICOLOR"){
      plateCost = 750 * pagesPerPlate;
    }

    console.log("rates: ", rates);

    const slab = rates.find(r => r.min_qty === 1);
    if (!slab) return 0;

    console.log("slab.rate: ", slab.rate);
    const rate = Number(slab.rate);

    let sheets = sheetCount;

    let slabs = Math.floor(sheets / 1000);
    let remainder = sheets % 1000;

    // rounding rule
    if (remainder >= 100) slabs += 1;

    // minimum charge
    if (slabs === 0) slabs = 1;

    const cost = slabs * rate + plateCost;

    console.log("plateCost: ", plateCost);

    return cost * sideMultiplier;
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







