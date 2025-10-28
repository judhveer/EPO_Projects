import dotenv from "dotenv";
import transporter from "../transporter.js";
dotenv.config();

export async function sendReportMail(name, percentages, highestTrait) {
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

  // Suggested roles based on highest trait
  const suggestedRolesMap = {
    D: [
      "Operations Manager",
      "Sales Leader",
      "Team Lead",
      "Business Development Manager",
      "Entrepreneur"
    ],
    I: [
      "Marketing Executive",
      "Customer Success Manager",
      "Public Relations Officer",
      "Event Planner",
      "Trainer/Coach"
    ],
    S: [
      "Administrative Assistant",
      "Customer Service Representative",
      "Human Resources Specialist",
      "Project Manager",
      "Quality Assurance Analyst"
    ],
    C: [
      "Data Analyst",
      "Quality Controller",
      "Accountant",
      "Research Associate",
      "Compliance Officer"
    ]
  };

  const suggestedRoles = suggestedRolesMap[highestTrait] || [];

  // Beautiful HTML email body
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 15px; color: #333;">
      <p>Dear Team HR,</p>

      <p>We hope this email finds you well. Please find below the DISC analysis for <strong>${name}</strong>.</p>

      <p>Based on the candidate's responses, the <strong>Highest Trait: ${getTraitFullName(highestTrait)} (${highestTrait})</strong> has been identified.</p>
      
      <p><strong>Suggested Roles:</strong></p>
      <ol>
        ${suggestedRoles.map((r) => `<li>${r}</li>`).join("")}
      </ol>

      <p>We trust this analysis will assist you in selecting the right candidate for the appropriate KRA and profile.</p>

      ${scoreTable}

      <p style="margin-top: 20px;">Kind Regards,</p>
      <p>
        <strong>Tech Team, EPO</strong><br/>
        +91-8556811041
      </p>
    </div>
  `;

  // Send email
  await transporter.sendMail({
    from: `"EPO Automation" <${process.env.EMAIL_USER}>`,
    to: process.env.BOSS_EMAIL,
    subject: `DISC Analysis Report - ${name}`,
    html: htmlBody,
    // attachments: [
    //   {
    //     filename: `DISC_Report_${name}.pdf`,
    //     path: pdfPath
    //   }
    // ]
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
