import { Op } from 'sequelize';
import models from '../../models/index.js';
import { sendMailForFMS } from '../../email/sendMail.js';
import { sendPushToUser } from '../../utils/pushNotification.js';
import {
  leaveRequestSubmittedTemplate,
  leaveRequestCancelledTemplate,
  leaveDecisionTemplate,
} from '../../email/templates/emailTemplates.js';

const { User } = models;

// ── Exact recipient rule, as specified: HR department, OR Admin
// department + ADMIN role together (not role=ADMIN anywhere). BOSS
// deliberately excluded — has full access already, doesn't need
// routine submit/cancel pings.
async function getLeaveNotificationRecipients() {
  return User.findAll({
    where: {
      isActive: true,
      [Op.or]: [
        { department: 'HR' },
        { department: 'Admin', role: 'ADMIN' },
      ],
    },
    attributes: ['id', 'email', 'username'],
  });
}

async function pushToRecipients(recipients, payload) {
  await Promise.allSettled(recipients.map((r) => sendPushToUser(r.id, payload)));
}

async function emailToRecipients(recipients, subject, html) {
  const emails = recipients.map((r) => r.email).filter(Boolean);
  if (emails.length === 0) return;
  await sendMailForFMS({ to: emails, subject, html });
}

// ── SUBMITTED ────────────────────────────────────────────────────────
export async function notifyRecipientsOfSubmission(request, employee, leaveTypeName) {
  const recipients = await getLeaveNotificationRecipients();
  if (recipients.length === 0) return;

  const dashboardUrl = `${process.env.LEADS_URL}/leave/approvals`;

  await Promise.allSettled([
    pushToRecipients(recipients, {
      title: 'New Leave Request',
      body: `${employee.username} requested ${leaveTypeName} — ${request.date_from} to ${request.date_to}`,
      data: { url: '/leave/approvals' },
    }),
    emailToRecipients(
      recipients,
      `New Leave Request — ${employee.username} | ${leaveTypeName}`,
      leaveRequestSubmittedTemplate({
        employeeName: employee.username, employeeOffice: employee.office,
        leaveTypeName, dateFrom: request.date_from, dateTo: request.date_to,
        reason: request.reason, dashboardUrl,
      }),
    ),
  ]);
}

// ── CANCELLED — every cancellation, both PENDING and APPROVED ──────
export async function notifyRecipientsOfCancellation(request, employee, leaveTypeName, wasApproved) {
  const recipients = await getLeaveNotificationRecipients();
  if (recipients.length === 0) return;

  const dashboardUrl = `${process.env.LEADS_URL}/leave/approvals`;

  await Promise.allSettled([
    pushToRecipients(recipients, {
      title: 'Leave Request Cancelled',
      body: `${employee.username} cancelled their ${leaveTypeName} request (${request.date_from} to ${request.date_to})`,
      data: { url: '/leave/approvals' },
    }),
    emailToRecipients(
      recipients,
      `Leave Request Cancelled — ${employee.username} | ${leaveTypeName}`,
      leaveRequestCancelledTemplate({
        employeeName: employee.username, employeeOffice: employee.office,
        leaveTypeName, dateFrom: request.date_from, dateTo: request.date_to,
        wasApproved, dashboardUrl,
      }),
    ),
  ]);
}

// ── APPROVED / REJECTED — sent only to the specific employee ───────
// Email skipped gracefully if they have none on file (Production
// Worker / Delivery may not) — push is always attempted regardless.
export async function notifyEmployeeOfDecision({
  request, employee, leaveTypeName, decision, decidedByName, decisionReason,
}) {
  const dashboardUrl = `${process.env.LEADS_URL}/leave`;

  const pushPromise = sendPushToUser(employee.id, {
    title: decision === 'APPROVED' ? 'Leave Approved' : 'Leave Rejected',
    body: `Your ${leaveTypeName} request (${request.date_from} to ${request.date_to}) was ${decision.toLowerCase()}.`,
    data: { url: '/leave' },
  });

  const emailPromise = employee.email
    ? sendMailForFMS({
        to: employee.email,
        subject: `Leave Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}`,
        html: leaveDecisionTemplate({
          employeeName: employee.username, leaveTypeName,
          dateFrom: request.date_from, dateTo: request.date_to,
          decision, decidedByName, decisionReason, dashboardUrl,
        }),
      })
    : Promise.resolve(); // no email on file — push only, matches your instruction exactly

  await Promise.allSettled([pushPromise, emailPromise]);
}