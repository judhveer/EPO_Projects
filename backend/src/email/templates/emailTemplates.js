

export function userCreatedEmail({
  username,
  email,
  password,
  role,
  department,
  createdByName = "Admin",
}) {
  const subject = "Your Account Has Been Created";

  const text = `
Hello ${username},

Your account has been created by ${createdByName}.

Login Details:
Email: ${email}
Username: ${username}
Password: ${password}
Role: ${role}
Department: ${department}

You can log in using your Email and Password.

Regards,
Admin Team
`;

  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb;">
    <h2 style="color:#1f2937;">Welcome to the System</h2>

    <p>Hello <strong>${username}</strong>,</p>

    <p>
      Your account has been successfully created by <strong>${createdByName}</strong>.
    </p>

    <h3 style="margin-top:20px;">🔐 Login Details</h3>
    <table style="width:100%; border-collapse: collapse;">
      <tr>
        <td style="padding:8px; border:1px solid #ddd;">Email</td>
        <td style="padding:8px; border:1px solid #ddd;"><strong>${email}</strong></td>
      </tr>
      <tr>
        <td style="padding:8px; border:1px solid #ddd;">Username</td>
        <td style="padding:8px; border:1px solid #ddd;"><strong>${username}</strong></td>
      </tr>
      <tr>
        <td style="padding:8px; border:1px solid #ddd;">Password</td>
        <td style="padding:8px; border:1px solid #ddd;"><strong>${password}</strong></td>
      </tr>
      <tr>
        <td style="padding:8px; border:1px solid #ddd;">Role</td>
        <td style="padding:8px; border:1px solid #ddd;">${role}</td>
      </tr>
      <tr>
        <td style="padding:8px; border:1px solid #ddd;">Department</td>
        <td style="padding:8px; border:1px solid #ddd;">${department}</td>
      </tr>
    </table>

    <p style="margin-top:20px;">
      👉 You can log in using your <strong>Email</strong> and <strong>Password</strong>.
    </p>

    <p style="margin-top:30px;">
      Regards,<br/>
      <strong>Admin Team</strong>
    </p>
  </div>
  `;

  return { subject, text, html };
}


export const designerAssignmentTemplate = ({
  designerName,
  jobNo,
  dashboardUrl,
}) => `
<div style="font-family: Arial, sans-serif; line-height: 1.6">
  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2>New Job Assigned</h2>

  <p>Hello <strong>${designerName}</strong>,</p>

  <p>You have been assigned a new design job.</p>

  <table style="border-collapse: collapse">
    <tr>
      <td><strong>Job No:</strong></td>
      <td>${jobNo}</td>
    </tr>
    <tr>
      <td><strong>Status:</strong></td>
      <td>Assigned to Designer</td>
    </tr>
  </table>

  <p style="margin-top:20px">
    Please visit your dashboard to view job details and start work.
  </p>

  <a href="${dashboardUrl}"
     style="background:#2563eb;color:#fff;padding:10px 16px;
     text-decoration:none;border-radius:4px">
     Go to Designer Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#666">
    Eastern Panorama Offset – FMS System
  </p>
</div>
`;


export const crmJobStageTemplate = ({
  crmName,
  jobNo,
  dashboardUrl,
}) => `
<div style="font-family: Arial, sans-serif; line-height: 1.6">
  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2>Job Status Update</h2>

  <p>Hello <strong>${crmName}</strong>,</p>

  <p>The following job has moved to the <strong>Designer stage</strong>.</p>

  <table>
    <tr>
      <td><strong>Job No:</strong></td>
      <td>${jobNo}</td>
    </tr>
    <tr>
      <td><strong>Current Stage:</strong></td>
      <td>Assigned to Designer</td>
    </tr>
  </table>

  <p style="margin-top:20px">
    You can track progress from your CRM dashboard.
  </p>

  <a href="${dashboardUrl}"
     style="background:#059669;color:#fff;padding:10px 16px;
     text-decoration:none;border-radius:4px">
     Go to CRM Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#666">
    This is an automated notification.
  </p>
</div>
`;
