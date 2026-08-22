import dotenv from "dotenv";
import { createTransporter } from "../transporter.js";
dotenv.config();


const DISC_PROFILES = {
  D: {
    name: "Dominance",
    description:
      "Results-oriented, decisive, direct, and comfortable taking ownership and making decisions.",
    strengths: [
      "Takes initiative and ownership",
      "Makes decisions quickly",
      "Focuses strongly on goals and results",
      "Comfortable handling challenges and pressure",
      "Naturally drives action and accountability",
    ],
    communication:
      "Usually prefers communication that is direct, concise, practical, and focused on outcomes.",
    workEnvironment:
      "Typically prefers autonomy, clear goals, challenging assignments, authority to act, and a fast-moving environment.",
    blindSpots: [
      "May appear too direct or impatient",
      "May move ahead before gathering enough input",
      "Can overlook emotional reactions when focused on results",
    ],
    roles: [
      "Operations Manager",
      "Sales Leader",
      "Team Lead",
      "Business Development Manager",
      "Entrepreneur",
    ],
  },

  I: {
    name: "Influence",
    description:
      "Enthusiastic, optimistic, communicative, and energized by people, relationships, and opportunities.",
    strengths: [
      "Builds relationships quickly",
      "Communicates with enthusiasm",
      "Motivates and energizes others",
      "Generates ideas and possibilities",
      "Creates a positive team atmosphere",
    ],
    communication:
      "Usually prefers open, energetic, conversational communication with opportunities to exchange ideas and interact with others.",
    workEnvironment:
      "Typically prefers collaborative, people-oriented, flexible environments with visibility, interaction, and opportunities to influence others.",
    blindSpots: [
      "May become distracted by new ideas",
      "Can overlook details when focused on people or possibilities",
      "May commit enthusiastically before considering every practical constraint",
    ],
    roles: [
      "Marketing Executive",
      "Customer Success Manager",
      "Public Relations Officer",
      "Event Planner",
      "Trainer/Coach",
    ],
  },

  S: {
    name: "Steadiness",
    description:
      "Patient, dependable, supportive, cooperative, and focused on maintaining stability and strong working relationships.",
    strengths: [
      "Reliable and consistent",
      "Supports colleagues effectively",
      "Builds trust and cooperation",
      "Listens patiently",
      "Maintains stability during change",
    ],
    communication:
      "Usually prefers respectful, patient, supportive communication and time to understand changes before acting.",
    workEnvironment:
      "Typically prefers stable, cooperative, respectful environments with clear expectations, trust, teamwork, and reasonable predictability.",
    blindSpots: [
      "May resist sudden change",
      "Can delay difficult conversations",
      "May prioritize harmony over expressing disagreement",
    ],
    roles: [
      "Administrative Assistant",
      "Customer Service Representative",
      "Human Resources Specialist",
      "Project Manager",
      "Quality Assurance Analyst",
    ],
  },

  C: {
    name: "Conscientiousness",
    description:
      "Analytical, precise, systematic, and focused on accuracy, standards, quality, and sound reasoning.",
    strengths: [
      "Strong attention to detail",
      "Analyzes information carefully",
      "Maintains high standards",
      "Identifies risks and errors",
      "Produces structured and accurate work",
    ],
    communication:
      "Usually prefers communication that is clear, organized, factual, precise, and supported by relevant information.",
    workEnvironment:
      "Typically prefers structured environments with clear standards, defined responsibilities, sufficient information, and time to produce quality work.",
    blindSpots: [
      "May overanalyze decisions",
      "Can become frustrated by poor planning or unclear expectations",
      "May focus so strongly on accuracy that speed is reduced",
    ],
    roles: [
      "Data Analyst",
      "Quality Controller",
      "Accountant",
      "Research Associate",
      "Compliance Officer",
    ],
  },
};

const DISC_COMBINATIONS = {
  "D/I":
    "A dynamic, persuasive profile that combines decisiveness and results focus with enthusiasm, communication, and the ability to energize others.",

  "D/S":
    "A results-focused profile balanced by patience, dependability, and attention to team stability.",

  "D/C":
    "A decisive and results-oriented profile supported by analysis, precision, and a strong focus on standards.",

  "I/D":
    "A highly energetic and persuasive profile that combines social influence with strong initiative and drive.",

  "I/S":
    "A people-oriented profile combining enthusiasm and relationship building with patience, cooperation, and support.",

  "I/C":
    "A communicative and engaging profile balanced by analytical thinking, accuracy, and attention to quality.",

  "S/D":
    "A supportive and dependable profile that can also become decisive and action-oriented when results require it.",

  "S/I":
    "A warm, cooperative profile combining relationship-building, encouragement, and dependable teamwork.",

  "S/C":
    "A stable and methodical profile combining patience, reliability, careful thinking, and attention to standards.",

  "C/D":
    "An analytical and precise profile combined with decisiveness, independence, and strong results orientation.",

  "C/I":
    "A thoughtful and analytical profile balanced by communication, enthusiasm, and the ability to engage others.",

  "C/S":
    "A careful and dependable profile combining accuracy, consistency, patience, and cooperation.",
};

function getDiscProfile(primaryTrait, secondaryTrait) {
  const primary = DISC_PROFILES[primaryTrait];
  const secondary = DISC_PROFILES[secondaryTrait];

  const combinationKey = `${primaryTrait}/${secondaryTrait}`;

  return {
    primary,
    secondary,
    combination:
      DISC_COMBINATIONS[combinationKey] ||
      `${primary.description} This profile also shows characteristics associated with ${secondary.name}.`,
  };
}

function getProfileStrengthText(profileStrength, profileType) {
  switch (profileStrength) {
    case "Very Strong":
      return `The ${profileType} pattern is strongly pronounced in this assessment. The primary behavioral style is substantially more prominent than the secondary style.`;

    case "Strong":
      return `The ${profileType} pattern is clearly visible. The primary behavioral style is meaningfully stronger than the secondary style.`;

    case "Moderate":
      return `The ${profileType} pattern is moderately defined. The employee shows a noticeable primary style while also showing meaningful characteristics of the secondary style.`;

    case "Balanced":
      return `The results are relatively balanced. The employee shows characteristics of more than one DISC style, so the profile should be interpreted as a behavioral blend rather than a single dominant style.`;

    default:
      return `The assessment indicates a ${profileType} behavioral pattern.`;
  }
}



export async function sendReportMail( name, percentages, highestTrait, secondaryTrait = null, profileType = highestTrait, profileStrength = "Moderate", scoreDifference = 0 ) {

  const profile = getDiscProfile(
    highestTrait,
    secondaryTrait || highestTrait
  );

  const profileStrengthText = getProfileStrengthText(
    profileStrength,
    profileType
  );

  const primary = profile.primary;
  const secondary = profile.secondary;

  const strengthsHtml = primary.strengths
    .map((item) => `<li>${item}</li>`)
    .join("");

  const blindSpotsHtml = primary.blindSpots
    .map((item) => `<li>${item}</li>`)
    .join("");

  const suggestedRoles = primary.roles;

  const suggestedRolesHtml = suggestedRoles
    .map((role) => `<li>${role}</li>`)
    .join("");

  // Format the table for scores
  const scoreTable = `
    <table border="1" cellspacing="0" cellpadding="8" style="border-collapse: collapse; font-family: Arial; font-size: 14px; width: 70%; margin-top: 10px;">
      <thead style="background-color:#f0f0f0;">
        <tr>
          <th style="text-align:left;">Trait</th>
          <th>Score (%)</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Dominance (D)</td><td style="text-align:center;">${percentages.D}%</td></tr>
        <tr><td>Influence (I)</td><td style="text-align:center;">${percentages.I}%</td></tr>
        <tr><td>Steadiness (S)</td><td style="text-align:center;">${percentages.S}%</td></tr>
        <tr><td>Conscientiousness (C)</td><td style="text-align:center;">${percentages.C}%</td></tr>
      </tbody>
    </table>
  `;


  const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 15px; color: #333; line-height: 1.6;">

      <p>Dear Team HR,</p>

      <p>
        Please find below the DISC behavioral analysis for
        <strong>${name}</strong>.
      </p>

      <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;" />

      <h2 style="color:#1f4e79;">DISC Behavioral Profile</h2>

      <p>
        <strong>Primary Style:</strong>
        ${primary.name} (${highestTrait})
      </p>

      <p>
        <strong>Secondary Style:</strong>
        ${secondary.name} (${secondaryTrait || "N/A"})
      </p>

      <p>
        <strong>Profile:</strong>
        ${profileType}
      </p>

      <p>
        <strong>Profile Strength:</strong>
        ${profileStrength}
      </p>

      <p>
        ${profileStrengthText}
      </p>

      <p>
        <strong>Primary vs Secondary Gap:</strong>
        ${scoreDifference} percentage points
      </p>

      <p>
        ${profile.combination}
      </p>

      ${scoreTable}

      <h3 style="color:#1f4e79;">Behavioral Summary</h3>

      <p>
        ${primary.description}
      </p>

      <h3 style="color:#1f4e79;">Key Strengths</h3>

      <ul>
        ${strengthsHtml}
      </ul>

      <h3 style="color:#1f4e79;">Communication Style</h3>

      <p>
        ${primary.communication}
      </p>

      <h3 style="color:#1f4e79;">Preferred Work Environment</h3>

      <p>
        ${primary.workEnvironment}
      </p>

      <h3 style="color:#1f4e79;">Possible Blind Spots</h3>

      <ul>
        ${blindSpotsHtml}
      </ul>

      <h3 style="color:#1f4e79;">Suggested Roles</h3>

      <ol>
        ${suggestedRolesHtml}
      </ol>

      <p style="font-size:13px;color:#666;margin-top:25px;">
        Note: DISC results describe behavioral preferences and tendencies.
        They should be considered alongside experience, skills, performance,
        interviews, and role-specific requirements when making hiring decisions.
      </p>

      <p style="margin-top:25px;">Kind Regards,</p>

      <p>
        <strong>Tech Team, EPO</strong><br/>
        +91-8556811041
      </p>

    </div>
  `;

  const transporter = await createTransporter();
  // Send email
  await transporter.sendMail({
    from: `"EPO Automation" <${process.env.EMAIL_USER}>`,
    to: process.env.BOSS_EMAIL,
    subject: `DISC Analysis Report - ${name}`,
    html: htmlBody,
  });

  console.log(`📧 DISC report emailed successfully to HR for ${name}`);
}

// Helper: convert single-letter trait to full name
function getTraitFullName(type) {
  switch (type) {
    case "D":
      return "Dominance";
    case "I":
      return "Influence";
    case "S":
      return "Steadiness";
    case "C":
      return "Conscientiousness";
    default:
      return "Unknown";
  }
}
