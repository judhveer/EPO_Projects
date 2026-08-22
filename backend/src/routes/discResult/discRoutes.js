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

    if (answers.length !== DISC_QUESTIONS.length) {
      return res.status(400).json({ error: "Please answer all questions." });
    }

    // ✅ Prevent duplicate submission (same mobile number)
    const existing = await db.Disc.findOne({ where: { mobile } });
    if (existing) {
      return res.status(409).json({
        error:
          "You have already completed the DISC Personality Test. Multiple submissions are not allowed. Please contact HR if you need assistance.",
      });
    }

    // ✅ Calculate DISC scores securely on the server
    // Do NOT trust ans.type from the frontend.
    // The server determines the DISC type from the official question/options.

    const scores = {
      D: 0,
      I: 0,
      S: 0,
      C: 0,
    };

    const answeredQuestionIds = new Set();

    for (const ans of answers) {
      const questionId = Number(ans.id);
      const optionIndex = Number(ans.optionIndex);

      // Find the official question
      const question = DISC_QUESTIONS.find((q) => q.id === questionId);

      if (!question) {
        return res.status(400).json({
          error: `Invalid question ID: ${ans.id}`,
        });
      }

      // Prevent duplicate answers for the same question
      if (answeredQuestionIds.has(questionId)) {
        return res.status(400).json({
          error: `Question ${questionId} was answered more than once.`,
        });
      }

      answeredQuestionIds.add(questionId);

      // Validate option index
      if (
        !Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= question.options.length
      ) {
        return res.status(400).json({
          error: `Invalid option for question ${questionId}.`,
        });
      }

      // Get the official option from the server's question data
      const selectedOption = question.options[optionIndex];

      // Get DISC type from the trusted server-side question data
      const trait = selectedOption.type;

      if (!["D", "I", "S", "C"].includes(trait)) {
        return res.status(400).json({
          error: `Invalid DISC trait for question ${questionId}.`,
        });
      }

      scores[trait]++;
    }

    // Make sure every question was answered exactly once
    if (answeredQuestionIds.size !== DISC_QUESTIONS.length) {
      return res.status(400).json({
        error: "Please answer every question exactly once.",
      });
    }

    // Total valid answers
    const total =
      scores.D +
      scores.I +
      scores.S +
      scores.C;

    if (total !== DISC_QUESTIONS.length) {
      return res.status(400).json({
        error: "Invalid DISC answers received. Please try again.",
      });
    }

    const percentages = {
      D: Number(((scores.D / total) * 100).toFixed(1)),
      I: Number(((scores.I / total) * 100).toFixed(1)),
      S: Number(((scores.S / total) * 100).toFixed(1)),
      C: Number(((scores.C / total) * 100).toFixed(1)),
    };


    // ✅ Rank DISC traits from highest to lowest
    const rankedTraits = Object.entries(percentages).sort(
      (a, b) => b[1] - a[1]
    );

    const primaryTrait = rankedTraits[0][0];
    const primaryScore = rankedTraits[0][1];

    const secondaryTrait = rankedTraits[1][0];
    const secondaryScore = rankedTraits[1][1];

    // Difference between primary and secondary
    const scoreDifference = Number(
      (primaryScore - secondaryScore).toFixed(1)
    );
    // Determine profile type
    let profileType;

    if (scoreDifference <= 5) {
      profileType = `${primaryTrait}/${secondaryTrait}`;
    } else {
      profileType = primaryTrait;
    }

    // ✅ Determine profile strength
    let profileStrength;

    if (scoreDifference >= 15) {
      profileStrength = "Very Strong";
    } else if (scoreDifference >= 10) {
      profileStrength = "Strong";
    } else if (scoreDifference >= 5) {
      profileStrength = "Moderate";
    } else {
      profileStrength = "Balanced";
    }

    // ✅ Generate a brief summary text
    const summary = `
      Primary Style: ${primaryTrait}
      Secondary Style: ${secondaryTrait}
      Profile: ${profileType}
      Profile Strength: ${profileStrength}
      Primary-Secondary Gap: ${scoreDifference} percentage points

      Dominance: ${percentages.D}%
      Influence: ${percentages.I}%
      Steadiness: ${percentages.S}%
      Conscientiousness: ${percentages.C}%
    `.trim();

    // ✅ Generate the PDF report
    // const pdfPath = await generateDiscPDF({ name, percentages, summary });

    // ✅ Send the email report to HR
    await sendReportMail( name, percentages, primaryTrait, secondaryTrait, profileType, profileStrength, scoreDifference );

    // ✅ Save result in database
    await db.Disc.create({
      name,
      mobile,
      dob,
      ...percentages,
      primaryTrait,
      secondaryTrait,
      profileType,
      profileStrength,
      summary,
    });

    // ✅ Send response to frontend
    return res.status(200).json({
      message: "Report generated and emailed successfully!",
      percentages,
      primaryTrait,
      secondaryTrait,
      profileType,
      profileStrength,
      scoreDifference,
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
