
// Email Template for User Creation Notification
export function userCreatedEmail({
  username,
  email,
  password,
  role,
  department,
  createdByName = "Admin",
}) {
  const subject = "Your Account Has Been Successfully Created";

  const text = `
Hello ${username},

Your system account has been successfully created by ${createdByName}.

Account Details:
Email: ${email}
Username: ${username}
Password: ${password}
Role: ${role}
Department: ${department}

You may now log in using your Email and Password.

Regards,
Admin Team
`;

  const html = `
  <div style="
    font-family: Arial, Helvetica, sans-serif;
    max-width: 600px;
    margin: auto;
    padding: 24px;
    background-color: #ffffff;
    border: 1px solid #e5e7eb;
  ">

    <!-- Logo -->
    <div style="text-align:center; margin-bottom:20px;">
      <img src="cid:epo-logo" height="55" alt="Company Logo" />
    </div>

    <!-- Header -->
    <h2 style="color:#1f2937; text-align:center; margin-bottom:10px;">
      Welcome to the System
    </h2>

    <p>Hello <strong>${username}</strong>,</p>

    <p>
      We are pleased to inform you that your system account has been
      successfully created by <strong>${createdByName}</strong>.
    </p>

    <!-- Account Details -->
    <h3 style="margin-top:25px; color:#111827;">📋 Account Details</h3>

    <table style="width:100%; border-collapse: collapse; font-size:14px;">
      <tr>
        <td style="padding:10px; border:1px solid #ddd; background:#f9fafb;">
          Email
        </td>
        <td style="padding:10px; border:1px solid #ddd;">
          <strong>${email}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:10px; border:1px solid #ddd; background:#f9fafb;">
          Username
        </td>
        <td style="padding:10px; border:1px solid #ddd;">
          <strong>${username}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:10px; border:1px solid #ddd; background:#f9fafb;">
          Password
        </td>
        <td style="padding:10px; border:1px solid #ddd;">
          <strong>${password}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:10px; border:1px solid #ddd; background:#f9fafb;">
          Role
        </td>
        <td style="padding:10px; border:1px solid #ddd;">
          ${role}
        </td>
      </tr>
      <tr>
        <td style="padding:10px; border:1px solid #ddd; background:#f9fafb;">
          Department
        </td>
        <td style="padding:10px; border:1px solid #ddd;">
          ${department}
        </td>
      </tr>
    </table>

    <p style="margin-top:20px;">
      You may now log in to the system using your
      <strong>Email/Username</strong> and <strong>Password</strong>.
    </p>

    <!-- Footer -->
    <p style="margin-top:30px;">
      Regards,<br/>
      <strong>Admin Team</strong>
    </p>

    <p style="margin-top:20px; font-size:12px; color:#6b7280; text-align:center;">
      This is an automated system-generated email.
    </p>

    <p style="margin-top:5px; font-size:12px; color:#6b7280; text-align:center;">
      © ${new Date().getFullYear()} Eastern Panorama Offset
    </p>

  </div>
  `;

  return { subject, text, html };
}

// JOB FMS Email Templates

// 1. Email template for order confirmation to client after job creation
export const orderConfirmationTemplate = ({
  clientName,
  jobNo,
  orderHandledBy,
  totalAmount,
  instructions,
}) => `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2>Welcome to EPO - Order Confirmation & Contact Details</h2>

  <p>Hello <strong>${clientName}</strong>,</p>

  <p>Greetings from <strong>Eastern Panorama Offset!</strong></p>

  <p>
    We're delighted to have you with us.<br/>
    Please find your order details below:
  </p>

  <ul>
    <li><strong>Job No:</strong> ${jobNo}</li>
    <li><strong>Assigned CRM:</strong> ${orderHandledBy}</li>
    <li><strong>Order Value:</strong> ₹${totalAmount || 0}</li>
    <li><strong>Order Specifications:</strong> ${instructions || "N/A"}</li>
  </ul>

  <p style="font-size:13px">
    <em>(Please note: Our contact numbers are available from 10:00 AM to 6:00 PM.)</em>
  </p>

  <hr style="margin:20px 0" />

  <h3>Contact Matrix for Escalation</h3>

  <table border="1" cellpadding="6" cellspacing="0"
    style="border-collapse:collapse;font-size:14px;width:100%">
    <thead>
      <tr style="background:#f3f4f6">
        <th align="left">Communication Level</th>
        <th align="left">Timelines</th>
        <th align="left">Contact Details</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1st Level</td>
        <td>Within 12 working hours</td>
        <td>
          Fanny - 8259831001 - crm@easternpanorama.in<br/>
          Saphiiaibet - 8258947402 - crm2@easternpanorama.in
        </td>
      </tr>
      <tr>
        <td>2nd Level</td>
        <td>If no response within 24 working hours</td>
        <td>
          8258947402 - ea@easternpanorama.in<br/>
          8258934002 - ea2@easternpanorama.in<br/>
          6909321443 - oa@easternpanorama.in
        </td>
      </tr>
      <tr>
        <td>3rd Level</td>
        <td>If no response within 24 working hours</td>
        <td>
          harshjw@easternpanorama.in
        </td>
      </tr>
    </tbody>
  </table>

  <p style="margin-top:30px">
    Warm regards,<br/>
    <strong>Team EPO</strong><br/>
    Eastern Panorama Offset
  </p>

</div>
`;

// 2. Email template for notifying CRM about new job assignment under their responsibility after job creation
export const crmJobAssignmentTemplate = ({
  crmName,
  jobNo,
  clientName,
  contactNumber,
  clientType,
  orderType,
  orderSource,
  orderReceivedBy,
  executionLocation,
  deliveryDate,
  deliveryLocation,
  taskPriority,
  totalAmount,
  advancePayment,
  paymentStatus,
  dashboardUrl,
}) => `
<div style="font-family: Arial, Helvetica, sans-serif; color:#333; line-height:1.6">

  <!-- Logo -->
  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <!-- Header -->
  <h2 style="color:#0a4da2;">📋 New Job Assigned</h2>

  <p>Dear <strong>${crmName}</strong>,</p>

  <p>
    A new job has been created and assigned under your responsibility.
    Please review the details below and initiate the required workflow.
  </p>

  <!-- Job Overview -->
  <h3 style="margin-top:20px;">🧾 Job Overview</h3>
  <table border="1" cellpadding="8" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px;">
    <tr><th align="left">Job No</th><td>${jobNo}</td></tr>
    <tr><th align="left">Client Name</th><td>${clientName}</td></tr>
    <tr><th align="left">Contact Number</th><td>${contactNumber}</td></tr>
    <tr><th align="left">Client Type</th><td>${clientType}</td></tr>
    <tr><th align="left">Order Type</th><td>${orderType}</td></tr>
    <tr><th align="left">Order Source</th><td>${orderSource}</td></tr>
    <tr><th align="left">Order Received By</th><td>${orderReceivedBy}</td></tr>
  </table>

  <!-- Execution & Delivery -->
  <h3 style="margin-top:20px;">🚚 Execution & Delivery</h3>
  <table border="1" cellpadding="8" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px;">
    <tr><th align="left">Execution Location</th><td>${executionLocation}</td></tr>
    <tr>
      <th align="left">Delivery Date</th>
      <td>${new Date(deliveryDate).toLocaleDateString()}</td>
    </tr>
    <tr><th align="left">Delivery Location</th><td>${deliveryLocation}</td></tr>
    <tr><th align="left">Priority</th><td>${taskPriority}</td></tr>
  </table>

  <!-- Commercial Summary -->
  <h3 style="margin-top:20px;">💰 Commercial Summary</h3>
  <table border="1" cellpadding="8" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px;">
    <tr><th align="left">Total Amount</th><td>₹${totalAmount}</td></tr>
    <tr><th align="left">Advance Payment</th><td>₹${advancePayment || 0}</td></tr>
    <tr><th align="left">Payment Status</th><td>${paymentStatus || "Pending"}</td></tr>
  </table>

  <!-- CTA -->
  <p style="margin-top:20px;">
    Please log in to the FMS dashboard to review the complete job details
    and coordinate with the Process Coordinator for further actions.
  </p>

  <a href="${dashboardUrl}"
     style="display:inline-block;margin-top:10px;
     background:#0a4da2;color:#fff;padding:10px 16px;
     text-decoration:none;border-radius:4px">
     View Job in Dashboard
  </a>

  <hr style="border:none; border-top:1px solid #e5e7eb; margin:25px 0;" />

  <p style="font-size:12px; color:#888;">
    This is an automated system notification.<br/>
    Eastern Panorama Offset - FMS
  </p>

</div>
`;

// 3. Email template for notifying process coordinator about new job created and review required after job creation
export const coordinatorJobReviewTemplate = ({
  jobNo,
  clientName,
  orderType,
  crmName,
  executionLocation,
  deliveryLocation,
  deliveryDate,
  taskPriority,
  paymentStatus,
  dashboardUrl,
}) => `
<div style="font-family: Arial, Helvetica, sans-serif; color:#333; line-height:1.6">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2 style="color:#0a4da2;">🆕 New JobCard Created - Review Required</h2>

  <p>Hello <strong>Process Coordinator Team</strong>,</p>

  <p>
    A new job card has been created and requires your immediate review in the FMS dashboard.
    Please evaluate the production requirements and timeline, and <strong>assign the job to the appropriate designer</strong> to initiate the process.
  </p>

  <h3 style="margin-top:20px;">📋 Job Details</h3>
  <table border="1" cellpadding="8" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px;">
    <tr><th align="left" style="width: 30%;">Job No</th><td>${jobNo}</td></tr>
    <tr><th align="left">Client Name</th><td>${clientName}</td></tr>
    <tr><th align="left">Order Type</th><td>${orderType}</td></tr>
    <tr><th align="left">Assigned CRM</th><td>${crmName}</td></tr>
  </table>

  <h3 style="margin-top:20px;">🏭 Production & Logistics</h3>
  <table border="1" cellpadding="8" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px;">
    <tr><th align="left" style="width: 30%;">Execution Location</th><td>${executionLocation}</td></tr>
    <tr><th align="left">Delivery Location</th><td>${deliveryLocation}</td></tr>
    <tr>
      <th align="left">Delivery Due Date</th>
      <td>${new Date(deliveryDate).toLocaleDateString()}</td>
    </tr>
    <tr><th align="left">Priority</th><td>${taskPriority}</td></tr>
    <tr><th align="left">Payment Status</th><td>${paymentStatus || "Pending"}</td></tr>
  </table>

  <p style="margin-top:20px;">
    Please log in to the FMS dashboard to complete the review and designer assignment.
  </p>

  <a href="${dashboardUrl}"
     style="display:inline-block;margin-top:10px;
     background:#0a4da2;color:#fff;padding:10px 16px;
     text-decoration:none;border-radius:4px">
     Open Job Dashboard
  </a>

  <hr style="border:none; border-top:1px solid #e5e7eb; margin:25px 0;" />

  <p style="font-size:12px; color:#888;">
    This is an automated system notification.<br/>
    Eastern Panorama Offset - FMS
  </p>

</div>
`;


// 5. Email template for notifying designer about new job assignment
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
    Eastern Panorama Offset - FMS System
  </p>
</div>
`;

//6. Email template for notifying CRM about job assignment to designer
export const crmJobStageTemplate = ({
  crmName,
  jobNo,
  designerName,
  assignedAt,
  dashboardUrl,
}) => `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2 style="color:#2563eb;">Job Assigned to Designer</h2>

  <p>Hello <strong>${crmName}</strong>,</p>

  <p>
    This is to inform you that the following job has been
    <strong>successfully assigned to a designer</strong>.
  </p>

  <table cellpadding="6" cellspacing="0"
    style="border-collapse:collapse; font-size:14px;">
    <tr>
      <td><strong>Job No</strong></td>
      <td>: ${jobNo}</td>
    </tr>
    <tr>
      <td><strong>Assigned To</strong></td>
      <td>: ${designerName}</td>
    </tr>
    <tr>
      <td><strong>Current Stage</strong></td>
      <td>: Assigned to Designer</td>
    </tr>
    ${
      assignedAt
        ? `<tr>
             <td><strong>Assigned On</strong></td>
             <td>: ${new Date(assignedAt).toLocaleString("en-IN")}</td>
           </tr>`
        : ""
    }
  </table>

  <p style="margin-top:20px">
    You may monitor progress, share inputs, or follow up if required
    from the CRM dashboard.
  </p>

  <a href="${dashboardUrl}"
     style="
       display:inline-block;
       background:#059669;
       color:#fff;
       padding:10px 16px;
       text-decoration:none;
       border-radius:4px;
       font-weight:bold;
     ">
     View Job in CRM Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#777">
    — Automated Notification | Eastern Panorama Offset
  </p>

</div>
`;

// 7. Email template for notifying process coordinator when designer started design
export const processCoordinatorDesignStartedTemplate = ({
  jobNo,
  clientName,
  designerName,
  startedAt,
  estimatedCompletionTime,
  dashboardUrl,
}) => `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2 style="color:#0a4da2;">🎨 Design Started</h2>

  <p>Hello <strong>Process Coordinator Team</strong>,</p>

  <p>
    The design task for the following job has been
    <strong>successfully started</strong> by the designer.
  </p>

  <table border="1" cellpadding="8" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px;">
    <tr><th align="left">Job No</th><td>${jobNo}</td></tr>
    <tr><th align="left">Client</th><td>${clientName}</td></tr>
    <tr><th align="left">Designer</th><td>${designerName}</td></tr>
    <tr><th align="left">Started At</th><td>${startedAt}</td></tr>
    <tr><th align="left">Design Estimated Completion Time</th><td>${estimatedCompletionTime}</td></tr>
  </table>

  <p style="margin-top:20px;">
    Please monitor the progress and prepare for the next workflow stage.
  </p>

  <a href="${dashboardUrl}"
     style="background:#2563eb;color:#fff;padding:10px 16px;
     text-decoration:none;border-radius:4px">
     Open Coordinator Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#666">
    Eastern Panorama Offset - FMS System
  </p>
</div>
`;


// 8. Email template for notifying CRM when designer started design
export const crmDesignStartedTemplate = ({
  crmName,
  jobNo,
  clientName,
  designerName,
  estimatedCompletionTime,
  dashboardUrl,
}) => `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2 style="color:#2563eb;">🛠️ Design Work Started</h2>

  <p>Hello <strong>${crmName}</strong>,</p>

  <p>
    The designer has started working on the design for the following job.
  </p>

  <table border="1" cellpadding="8" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px;">
    <tr><th align="left">Job No</th><td>${jobNo}</td></tr>
    <tr><th align="left">Client</th><td>${clientName}</td></tr>
    <tr><th align="left">Designer</th><td>${designerName}</td></tr>
    <tr><th align="left">Design Estimated Completion Time</th><td>${estimatedCompletionTime}</td></tr>
  </table>

  <p style="margin-top:20px;">
    No action is required at this stage. You will be notified once
    the design is completed and ready for client approval.
  </p>

  <a href="${dashboardUrl}"
     style="background:#2563eb;color:#fff;padding:10px 16px;
     text-decoration:none;border-radius:4px">
     Go to CRM Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#666">
    This is an automated system notification.
  </p>
</div>
`;

// 9. Email template for notifying process coordinator when designer completed design
export const processCoordinatorDesignCompletedTemplate = ({
  jobNo,
  clientName,
  designerName,
  completedAt,
  dashboardUrl,
}) => `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2 style="color:#0a4da2;">🎨 Design Completed</h2>

  <p>Hello <strong>Process Coordinator Team</strong>,</p>

  <p>
    The design task for the following job has been successfully
    <strong>completed by the designer</strong> and is now ready for
    the next stage.
  </p>

  <table border="1" cellpadding="8" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px;">
    <tr><th align="left">Job No</th><td>${jobNo}</td></tr>
    <tr><th align="left">Client</th><td>${clientName}</td></tr>
    <tr><th align="left">Designer</th><td>${designerName}</td></tr>
    <tr><th align="left">Completed At</th><td>${completedAt}</td></tr>
    <tr><th align="left">Current Stage</th><td>Sent to CRM for Client Approval</td></tr>
  </table>

  <p style="margin-top:20px;">
    Please review the job and coordinate with the CRM team if required.
  </p>

  <a href="${dashboardUrl}"
     style="background:#2563eb;color:#fff;padding:10px 16px;
     text-decoration:none;border-radius:4px">
     Open Coordinator Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#666">
    Eastern Panorama Offset - FMS System
  </p>
</div>
`;

// 10. Email template for notifying CRM when designer completed design
export const crmDesignCompletedTemplate = ({
  crmName,
  jobNo,
  clientName,
  designerName,
  dashboardUrl,
}) => `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2 style="color:#059669;">✅ Design Completed - Action Required</h2>

  <p>Hello <strong>${crmName}</strong>,</p>

  <p>
    The design work for the following job has been completed by the
    designer and is now ready for <strong>client approval</strong>.
  </p>

  <table border="1" cellpadding="8" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px;">
    <tr><th align="left">Job No</th><td>${jobNo}</td></tr>
    <tr><th align="left">Client</th><td>${clientName}</td></tr>
    <tr><th align="left">Designer</th><td>${designerName}</td></tr>
    <tr><th align="left">Current Stage</th><td>Sent for Approval</td></tr>
  </table>

  <p style="margin-top:20px;">
    👉 Please upload and send the design sample files to the client
    for approval at the earliest.
  </p>

  <a href="${dashboardUrl}"
     style="background:#16a34a;color:#fff;padding:10px 16px;
     text-decoration:none;border-radius:4px">
     Go to CRM Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#666">
    This is an automated system notification.
  </p>
</div>
`;

// 11. Email template for notifying process coordinator when CRM sent design to client for approval
export const processCoordinatorApprovalSentTemplate = ({
  coordinatorName,
  crmName,
  jobNo,
  clientName,
  sentAt,
  dashboardUrl,
}) => `
<div style="font-family: Arial, Helvetica, sans-serif; line-height:1.6; color:#333">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2 style="color:#2563eb;">📤 Client Approval Sent</h2>

  <p>Dear <strong>${coordinatorName}</strong>,</p>

  <p>
    This is to inform you that the CRM executive
    <strong>${crmName}</strong> has successfully sent the job listed
    below to the client for approval.
  </p>

  <table border="1" cellpadding="10" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px; margin-top:15px;">
    <tr>
      <th align="left" style="background:#f3f4f6">Job No</th>
      <td>${jobNo}</td>
    </tr>
    <tr>
      <th align="left" style="background:#f3f4f6">Client Name</th>
      <td>${clientName}</td>
    </tr>
    <tr>
      <th align="left" style="background:#f3f4f6">Handled By (CRM)</th>
      <td>${crmName}</td>
    </tr>
    <tr>
      <th align="left" style="background:#f3f4f6">Current Status</th>
      <td>Awaiting Client Response</td>
    </tr>
    <tr>
      <th align="left" style="background:#f3f4f6">Sent On</th>
      <td>${sentAt}</td>
    </tr>
  </table>

  <p style="margin-top:20px;">
    The job is currently on hold and pending feedback or approval from the client.
    Kindly monitor the status and be prepared to proceed once the client response is received.
  </p>

  <a href="${dashboardUrl}"
     style="display:inline-block;margin-top:15px;
     background:#2563eb;color:#fff;padding:10px 18px;
     text-decoration:none;border-radius:4px">
     View Job in Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#666">
    This is an automated notification from the CRM system.
    Please do not reply to this email.
  </p>
</div>
`;


/**
 * 13. Email Template - Client Approved Job
 * Sent to: Process Coordinators & Assigned Designer
 */
export const clientApprovedTemplate = ({
  recipientName,
  jobNo,
  clientName,
  crmName,
  designerName,
  approvedAt,
  dashboardUrl,
}) => `
<div style="font-family: Arial, Helvetica, sans-serif; line-height:1.6; color:#333">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2 style="color:#16a34a;">✅ Client Approval Received</h2>

  <p>Dear <strong>${recipientName}</strong>,</p>

  <p>
    We are pleased to inform you that the client has
    <strong>approved</strong> the job detailed below.
  </p>

  <table border="1" cellpadding="10" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px; margin-top:15px;">
    <tr>
      <th align="left" style="background:#f3f4f6">Job No</th>
      <td>${jobNo}</td>
    </tr>
    <tr>
      <th align="left" style="background:#f3f4f6">Client Name</th>
      <td>${clientName}</td>
    </tr>
    <tr>
      <th align="left" style="background:#f3f4f6">Handled By (CRM)</th>
      <td>${crmName}</td>
    </tr>
    <tr>
      <th align="left" style="background:#f3f4f6">Assigned Designer</th>
      <td>${designerName}</td>
    </tr>
    <tr>
      <th align="left" style="background:#f3f4f6">Approval Date</th>
      <td>${approvedAt}</td>
    </tr>
    <tr>
      <th align="left" style="background:#f3f4f6">Current Status</th>
      <td>Approved</td>
    </tr>
  </table>

  <p style="margin-top:20px;">
    The job is now ready to move forward to the Production.
  </p>

  <a href="${dashboardUrl}"
     style="display:inline-block;margin-top:15px;
     background:#16a34a;color:#fff;padding:10px 18px;
     text-decoration:none;border-radius:4px">
     View Job in Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#666">
    This is an automated notification from the CRM system.
    Please do not reply to this email.
  </p>
</div>
`;


// 14. Email Template - Client Changes Requested
// Sent to: Process Coordinator
export const clientChangesProcessTemplate = ({
  coordinatorName,
  jobNo,
  clientName,
  crmName,
  feedback,
  designerName,
  dashboardUrl,
}) => `
<div style="font-family: Arial, Helvetica, sans-serif; line-height:1.6; color:#333">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2 style="color:#dc2626;">🔁 Client Changes Requested</h2>

  <p>Dear <strong>${coordinatorName}</strong>,</p>

  <p>
    The client has reviewed the design and requested changes for the job
    mentioned below. The job has been moved back for redesign and has been
    reassigned to the designer, <strong>${designerName}</strong>, for
    necessary revisions.
  </p>


  <table border="1" cellpadding="10" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px; margin-top:15px;">
    <tr><th align="left" style="background:#f3f4f6">Job No</th><td>${jobNo}</td></tr>
    <tr><th align="left" style="background:#f3f4f6">Client Name</th><td>${clientName}</td></tr>
    <tr><th align="left" style="background:#f3f4f6">Handled By (CRM)</th><td>${crmName}</td></tr>
    <tr>
      <th align="left" style="background:#f3f4f6">Reassigned To</th>
      <td>${designerName}</td>
    </tr>
    <tr><th align="left" style="background:#f3f4f6">Current Status</th><td>Client Changes Requested</td></tr>
  </table>

  <p style="margin-top:15px;"><strong>Client Feedback:</strong></p>
  <p style="background:#f9fafb;padding:12px;border-left:4px solid #dc2626">
    ${feedback}
  </p>

  <p style="margin-top:20px;">
    Kindly monitor the redesign progress and ensure timely follow-up
    once the updated design is ready for client approval.
  </p>

  <a href="${dashboardUrl}"
     style="display:inline-block;margin-top:15px;
     background:#dc2626;color:#fff;padding:10px 18px;
     text-decoration:none;border-radius:4px">
     View Job in Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#666">
    This is an automated notification from the CRM system.
  </p>
</div>
`;


// 15. Email Template - Client Changes Requested
// Sent to: Assigned Designer
export const designerRedesignTemplate = ({
  designerName,
  jobNo,
  clientName,
  feedback,
  dashboardUrl,
}) => `
<div style="font-family: Arial, Helvetica, sans-serif; line-height:1.6; color:#333">

  <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />

  <h2 style="color:#dc2626;">🎨 Redesign Required - Client Feedback Received</h2>

  <p>Hello <strong>${designerName}</strong>,</p>

  <p>
    The client has reviewed the design for the following job and has requested
    changes. The job has been reassigned to you for redesign.
  </p>

  <table border="1" cellpadding="10" cellspacing="0"
    style="border-collapse:collapse; width:100%; font-size:14px; margin-top:15px;">
    <tr><th align="left" style="background:#f3f4f6">Job No</th><td>${jobNo}</td></tr>
    <tr><th align="left" style="background:#f3f4f6">Client Name</th><td>${clientName}</td></tr>
    <tr><th align="left" style="background:#f3f4f6">Current Status</th><td>Redesign Required</td></tr>
  </table>

  <p style="margin-top:15px;"><strong>Client Feedback:</strong></p>
  <p style="background:#f9fafb;padding:12px;border-left:4px solid #dc2626">
    ${feedback}
  </p>

  <p style="margin-top:20px;">
    Please review the feedback carefully and proceed with the necessary
    design changes at the earliest.
  </p>

  <a href="${dashboardUrl}"
     style="display:inline-block;margin-top:15px;
     background:#2563eb;color:#fff;padding:10px 18px;
     text-decoration:none;border-radius:4px">
     Go to Designer Dashboard
  </a>

  <p style="margin-top:30px;font-size:12px;color:#666">
    Eastern Panorama Offset - FMS System
  </p>
</div>
`;





// 16. For Production when client approved the design
export const productionReadyTemplate = ({
  recipientName,
  jobNo,
  clientName,
  crmName,
  designerName,
  approvedAt,
  dashboardUrl,
}) => {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>Dear ${recipientName},</p>

      <p>
        We are pleased to inform you that the client has approved the job 
        <strong>${jobNo}</strong>.
      </p>

      <p>
        The job is now ready to proceed to the <strong>Production stage</strong>.
      </p>

      <p><strong>Job Details:</strong></p>
      <ul>
        <li><strong>Job No:</strong> ${jobNo}</li>
        <li><strong>Client Name:</strong> ${clientName}</li>
        <li><strong>CRM:</strong> ${crmName}</li>
        <li><strong>Designer:</strong> ${designerName || "N/A"}</li>
        <li><strong>Approved At:</strong> ${approvedAt}</li>
      </ul>

      <p>
        You may review the job details here:<br/>
        <a href="${dashboardUrl}">${dashboardUrl}</a>
      </p>

      <p>Please take the necessary actions to initiate production.</p>

      <p>Best regards,<br/>EPO FMS Team</p>
    </div>
  `;
};