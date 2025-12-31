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
