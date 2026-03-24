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












const convertToInches = (value, unit) => {
  switch (unit) {
    case "mm":
      return value / 25.4;

    case "cm":
      return value / 2.54;

    case "ft":
      return value * 12;

    case "in":
    default:
      return value;
  }
};



// calculations:

// Parse size "6x9" → { width: 6, height: 9 }
// ---------------------- SIZE PARSER ----------------------
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

  // STEP 2: convert based on category
  if (
    category === "single-sheet" ||
    category === "multiple-sheet"
  ) {
    return { width, height, unit: "inches" };
  }

  if (category === "wide-format") {
    return {
      width: width / 12,
      height: height / 12,
      unit: "feet"
    };
  }

  return { width, height, unit: "inches" }; // fallback
};

// ---------------------- UPS CALCULATION ----------------------
const calculateUps = (sheet, job) => {
  console.log("calculateUps called:")
  const normal =
    Math.floor(sheet.width / job.width) * Math.floor(sheet.height / job.height);

  const rotated =
    Math.floor(sheet.width / job.height) * Math.floor(sheet.height / job.width);

  const ups = Math.max(normal, rotated);
  if (ups === 0) return 0; // cannot fit even one piece
  return ups;
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

    // console.log("item: ", item);

    // console.log("Allitem: ", all_items);

    // if (!paper_type || !paper_gsm || !size || !quantity) {
    //   return res.status(400).json({ message: "Required fields missing" });
    // }

    const qty = Number(quantity);

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
      if (category === "wide-format") {
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
    // const jobSize = parseSize(size);
    if (!jobSize) {
      return res.status(400).json({ message: "Invalid size format" });
    }

    console.log("jobSize: ", jobSize);
    

    if (category === "Wide Format") {

      const { wide_material_name, wide_material_gsm, wide_material_thickness } = item;
      const { width, height } = jobSize; // assume already in FEET
      const qty = Number(quantity);

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
        // console.log("Evaluating roll material: ", mat.dataValues);
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
            // console.log("New best option (roll): ", bestOption);
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
          const artworkArea = width * height * qty;                      // billable sqft
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
            // console.log("New best option (board): ", bestOption.material);
          }
        }
      }

      if (!bestOption) {
        return res.status(400).json({
          message: "No suitable roll/board found for given size"
        });
      }

      // ------------------- Printing cost for wide format -------------------
      let printingCost = 0;

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
      let grandTotal = 0;

      if (Array.isArray(all_items)) {
        for (const it of all_items) {
          if (!it) continue;

          if (it.id && item.id && it.id === item.id) continue;
          if (it._temp_id && item._temp_id && it._temp_id === item._temp_id) continue;

          if (it.item_total) {
            grandTotal += Number(it.item_total);
          }
        }
      }

      grandTotal += finalItemTotal;

      console.log("bestOption: ", bestOption);
      // ✅ RETURN SAME SHAPE AS OTHER CATEGORIES

      console.log("bindingCostTotal: ", bindingCostTotal);
      console.log("printingCost: ", printingCost);
      return res.json({
        inside: {
          sheet_selected: null,
          sheet_dimensions: null,
          ups: null,
          sheets: null,
          sheets_with_wastage: null,
          sheet_rate: null,
          total_sheet_cost: null,
          printing_rate_per_sheet: null,
          printing_cost_total: null,
        },

        cover: {
          sheet_selected: null,
          sheet_dimensions: null,
          ups: null,
          sheets: null,
          sheets_with_wastage: null,
          sheet_rate: null,
          total_sheet_cost: null,
          printing_rate_per_sheet: null,
          printing_cost_total: null,
        },

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
          // Binding cost
          total_binding_cost: bindingCostTotal,
        },
      });
    }

    if (
      category === "Single Sheet" &&
      (paper_type === "Maplitho Plotter Paper" ||
        paper_type === "Photo Plotter Paper")
    ) {

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


    let whereCondition = {
      paper_name: paper_type,
      gsm: paper_gsm,
    };

    // For plotter papers also match sheet size
    if (
      paper_type === "Maplitho Plotter Paper" ||
      paper_type === "Photo Plotter Paper"
    ) {
      whereCondition.size_name = size.trim().toUpperCase();
    }

    // ------------------- 2. Find paper rows for inside (or single) -------------------
    let insidePaperRows = await PaperMaster.findAll({
      where: whereCondition,
    });

    if (!insidePaperRows || insidePaperRows.length === 0) {
      return res.status(404).json({ message: "Inside paper not found" });
    }
    
    const pressType = (item.inside_press_type || item.press_type || "").toUpperCase();    // must be sent from frontend (e.g., "DIGITAL BLACK WHITE", "HMT", etc.)
    const coverPressType = (item.cover_press_type  || "").toUpperCase();

    const isDigitalPress =
      pressType === "DIGITAL MULTICOLOR" ||
      pressType === "DIGITAL BLACK WHITE";

      // DIGITAL PRESS → only allow 12x18 and 13x19
    if (isDigitalPress) {
      insidePaperRows = insidePaperRows.filter(
        s =>
          (Number(s.width) === 12 && Number(s.height) === 18) ||
          (Number(s.width) === 13 && Number(s.height) === 19)
      );
    }

    let { bestSheet: bestInsideSheet, bestUps: bestUpsInside } = pickBestSheet(insidePaperRows, jobSize);

    // if(sides === "Both Side" ){
    //   bestUpsInside = bestUpsInside * 2;
    // }

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
      if (!coverPaperRows || coverPaperRows.length === 0){
        return res.status(404).json({ message: "Cover paper not found" });
      }


      const isDigitalPressForCover =
        coverPressType === "DIGITAL MULTICOLOR" ||
        coverPressType === "DIGITAL BLACK WHITE";

      // DIGITAL PRESS → only allow 12x18 and 13x19
      if (isDigitalPressForCover) {
        coverPaperRows = coverPaperRows.filter(
          s =>
            (Number(s.width) === 12 && Number(s.height) === 18) ||
            (Number(s.width) === 13 && Number(s.height) === 19)
        );
      }

      const picked = pickBestSheet(coverPaperRows, jobSize);
      bestCoverSheet = picked.bestSheet ;
      bestUpsCover = picked.bestUps;

    }

    // ------------------- 4. Compute sheets required -------------------
    let insideSheets = 0;
    let coverSheets = 0;

    if (category === "Multiple Sheet") {
      // ✅ UPS SHOULD DOUBLE for BOTH SIDE (PAGES LOGIC)
      if (sides === "Both Side" || sides === "Both Sides") {
        bestUpsInside = bestUpsInside * 2;
      }
      const inside_total_pages = Number(inside_pages) * qty; // pages × copies
      insideSheets = Math.ceil(inside_total_pages / bestUpsInside);


      const cover_total_pages = Number(cover_pages) * qty;
      coverSheets = Math.ceil(cover_total_pages / bestUpsCover);

    } else {
      // Single sheet/Other/Wide format: treat as single sheet requirement
       // ❌ UPS NEVER changes for Single Sheet
      insideSheets = Math.ceil(qty / bestUpsInside);
      coverSheets = 0;
    }

    // Apply 5% wastage per sheet type (round up)
    
    // For plotter papers there will be no wastage
    const isPlotterPaper =
      paper_type === "Maplitho Plotter Paper" ||
      paper_type === "Photo Plotter Paper";


    const insideSheetsWithWastage = isPlotterPaper ? insideSheets : Math.ceil(insideSheets * 1.05);

    const coverSheetsWithWastage = Math.ceil(coverSheets * 1.05);
    const totalSheetsWithWastage =
      insideSheetsWithWastage + coverSheetsWithWastage;
    

    // ------------------- 5. Sheet cost calculation (separate rates) -------------------
    const insideSheetRate = Number(bestInsideSheet.rate_per_sheet || 0);

    const insideTotalSheetCost = insideSheetsWithWastage * insideSheetRate;

    let coverSheetRate = insideSheetRate;
    let coverTotalSheetCost = 0;
    if (coverSheets > 0) {
      coverSheetRate = Number(bestCoverSheet.rate_per_sheet || insideSheetRate);
      coverTotalSheetCost = coverSheetsWithWastage * coverSheetRate;
    }

    const totalSheetCost = insideTotalSheetCost + coverTotalSheetCost;


    // ------------------- 6. Printing cost (per sheet) -------------------
    const insideColor =
      category === "Multiple Sheet"
        ? color_scheme
        : color_scheme;
    const coverColor =
      category === "Multiple Sheet"
        ? cover_color_scheme || color_scheme
        : color_scheme;

    // ------------------- 6. Printing cost (using press rates) -------------------
    // Inside printing
    const insidePrintingCostTotal = await calculatePrintingCost(
      pressType,
      insideColor,        // color scheme for inside
      sides,
      insideSheetsWithWastage, // total sheets to print
      jobSize,
      qty,
      bestUpsInside,
      category
    );

    // Cover printing (if applicable)
    let coverPrintingCostTotal = 0;
    if (category === "Multiple Sheet" && coverSheetsWithWastage > 0) {
      coverPrintingCostTotal = await calculatePrintingCost(
        coverPressType,
        coverColor,
        Number(cover_pages) === 4 ? "Both Side" : "Single Side",
        coverSheetsWithWastage,
        jobSize,
        qty,
        bestUpsCover,
        category,
        true,
      );
    }

    console.log("InsidePrintingCostTotal: ", insidePrintingCostTotal);
    console.log("coverPrintingCostTotal: ", coverPrintingCostTotal);

    const totalPrintingCost = insidePrintingCostTotal + coverPrintingCostTotal;


    console.log("totalPrintingCost: ", totalPrintingCost);

    // ------------------- 7. Binding cost (applies on total qty) -------------------
    let bindingCostTotal = 0;
    if (binding_types && binding_types.length > 0) {
      // fetch all binding rows matching selected names
      const bindingRows = await BindingMaster.findAll({
        where: { 
          binding_name: binding_types,
          category: category
        },
      });

      // Build context for binding calculation
      const bindingContext = {
        insidePages: Number(item.inside_pages || 0),
        coverPages: Number(item.cover_pages || 0),
        insideSheets: insideSheetsWithWastage,                 // total inside sheets for all copies
        coverSheets: coverSheets || 0,
        ups: bestUpsInside,                          // copies per sheet (forma)
        size: jobSize,                                // { width, height } in inches (or feet for wide)
        sides: sides,
        itemName: item.enquiry_for || '',               // to detect school copy
        creasesPerSheet: Number(item.creases_per_sheet || 0),
        foldsPersheet: Number(item.folds_per_sheet || 0),
      };

      bindingCostTotal = calculateBindingCost(bindingRows, item, qty, bindingContext);
    }


    console.log("bindingCostTotal: ", bindingCostTotal);

    // ------------------- 8. Unit rate & totals -------------------
    // total sheet cost per copy
    const sheetCostPerCopy = totalSheetCost / qty;

    // printing cost per copy (distribute printing cost across copies)
    const printingCostPerCopy = totalPrintingCost / qty;

    console.log("printingCostPerCopy: ", printingCostPerCopy);

    // binding cost per copy (user wanted binding applied on total qty)
    const bindingCostPerCopy = bindingCostTotal / qty;

    // final unit rate
    const unitRate =
      Number(sheetCostPerCopy) +
      Number(printingCostPerCopy) +
      Number(bindingCostPerCopy);

    const itemTotal = unitRate * qty;


    // ------------------- 9. Grand total (sum of all items) -------------------
    let grandTotal = 0;

    if (Array.isArray(all_items)) {
      for (const it of all_items) {
        if (!it) continue;

        // SKIP current item (jo recalculate ho raha hai)
        if (it.id && item.id && it.id === item.id) continue;

        if(it._temp_id && item._temp_id && it._temp_id === item._temp_id) continue;

        if (it.item_total) {
          grandTotal += Number(it.item_total);
        }
      }
    }
    grandTotal += itemTotal;


    // ------------------- 10. Return full breakdown -------------------
    return res.json({
      inside: {
        sheet_selected: bestInsideSheet.size_name,
        sheet_name: bestInsideSheet.paper_name + " " + (bestInsideSheet.size_category || "" ), 
        sheet_dimensions: `${bestInsideSheet.width}x${bestInsideSheet.height}`,
        ups: bestUpsInside,
        sheets: insideSheets,
        sheets_with_wastage: insideSheetsWithWastage,
        sheet_rate: insideSheetRate,
        total_sheet_cost: insideTotalSheetCost,
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
    foldsPersheet
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
    // ----- Numbering + Interleaf + Perforation (combined) -----
    else if (name.includes('numbering') && name.includes('interleaf') && name.includes('perforation')) {
      if (item.category === 'Multiple Sheet') {
        const totalPages = insidePages * qty;          // total pages across all copies
        const slabs = Math.ceil(totalPages / 500);     // number of 500‑page slabs (rounded up)
        cost = slabs * 150;                            // ₹150 per slab
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
  console.log("pressType: ", pressType, ", colorScheme: ", colorScheme, ", sides: " , sides, " , sheetCount: ", sheetCount, ", jobSize: ", jobSize, ", qty: ", qty, ", ups: ", ups);

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
    console.log("coverFlag: ", coverFlag);
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


// ---------------------- BEST SHEET PICKING ----------------------
const pickBestSheet = (paperRows, jobSize) => {
  console.log("Pick best sheet called:");
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



// calculate number of folds from forma (e.g. A4 → 0, A5 → 1, A6 → 2, etc.)
const calculateFoldsFromForma = (forma) => {
  if (forma <= 0) return 0;

  // ensure it's power of 2
  if ((forma & (forma - 1)) !== 0) {
    console.warn("Forma is not power of 2. Folding may be incorrect.");
  }

  return Math.log2(forma/2); 
};

