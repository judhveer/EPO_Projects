import express from "express";
import { DISC_QUESTIONS } from "../../utils/discResult/discQuestions.js";
import { sendReportMail } from "../../email/discReport/discReport.js";
import db from '../../models/index.js';

const router = express.Router();

/**
 * @route   GET /api/disc/questions
 * @desc    Get DISC questions
 */
router.get("/questions", (req, res) => {
  try {
    return res.json(DISC_QUESTIONS);
  } catch (err) {
    console.error("Error fetching questions:", err);
    return res.status(500).json({ error: "Failed to load DISC questions." });
  }
});

/**
 * @route   POST /api/disc/submit
 * @desc    Submit DISC test and generate report
 */
router.post("/submit", async (req, res) => {
  try {
    const { name, mobile, dob, answers } = req.body;

    // ✅ Basic validation
    if (!name || !mobile || !dob || !answers || !answers.length) {
      return res
        .status(400)
        .json({ error: "Please fill all required fields before submitting." });
    }

    // ✅ Prevent duplicate submission (same mobile number)
    const existing = await db.Disc.findOne({ where: { mobile } });
    if (existing) {
      return res.status(409).json({
        error:
          "You have already completed the DISC Personality Test. Multiple submissions are not allowed. Please contact HR if you need assistance.",
      });
    }

    // ✅ Calculate DISC scores
    const scores = { D: 0, I: 0, S: 0, C: 0 };
    for (const ans of answers) {
      if (scores.hasOwnProperty(ans.type)) {
        scores[ans.type]++;
      }
    }

    const total = scores.D + scores.I + scores.S + scores.C;
    if (total === 0) {
      return res
        .status(400)
        .json({ error: "No valid answers received. Please try again." });
    }

    const percentages = {
      D: ((scores.D / total) * 100).toFixed(1),
      I: ((scores.I / total) * 100).toFixed(1),
      S: ((scores.S / total) * 100).toFixed(1),
      C: ((scores.C / total) * 100).toFixed(1),
    };

    // ✅ Generate a brief summary text
    const summary = `Dominance: ${percentages.D}% | Influence: ${percentages.I}% | Steadiness: ${percentages.S}% | Conscientiousness: ${percentages.C}%`;

    // ✅ Identify the highest trait
    const highestTrait = Object.entries(percentages).reduce((a, b) =>
      parseFloat(a[1]) > parseFloat(b[1]) ? a : b
    )[0];

    // ✅ Generate the PDF report
    // const pdfPath = await generateDiscPDF({ name, percentages, summary });

    // ✅ Send the email report to HR
    await sendReportMail(name, percentages, highestTrait);

    // ✅ Save result in database
    await db.Disc.create({ name, mobile, dob, ...percentages, summary });

    // ✅ Send response to frontend
    return res.status(200).json({
      message: "Report generated and emailed successfully!",
      percentages,
    });
  } catch (error) {
    console.error("DISC Test Submission Error:", error);
    return res.status(500).json({
      error:
        "An unexpected error occurred while processing your DISC Test. Please try again later or contact support.",
    });
  }
});    

export default router;
