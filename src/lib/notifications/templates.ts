/**
 * Branded email HTML templates — shared message models for future channels.
 */

import type { TemplateKey } from "./types";

export type Branding = {
  companyName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  footer?: string | null;
};

export type TemplateVars = {
  employeeName: string;
  companyName: string;
  periodLabel?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  supportNote?: string;
  leaveType?: string;
  leaveDates?: string;
  leaveDays?: string;
  hrNote?: string;
  workDate?: string;
  hoursWorked?: string;
  remaining?: string;
  validationSummary?: string;
  branding?: Branding;
};

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(opts: {
  title: string;
  preheader: string;
  bodyHtml: string;
  branding?: Branding;
}): string {
  const primary = opts.branding?.primaryColor || "#002147";
  const accent = opts.branding?.secondaryColor || "#50C878";
  const company = escapeHtml(opts.branding?.companyName || "Slipdesk");
  const logo = opts.branding?.logoUrl
    ? `<img src="${escapeHtml(opts.branding.logoUrl)}" alt="${company}" style="max-height:40px;margin-bottom:8px" />`
    : "";
  const footer = opts.branding?.footer
    ? `<p style="margin:16px 0 0;font-size:12px;color:#94a3b8">${escapeHtml(opts.branding.footer)}</p>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:${primary};padding:24px 28px">
  ${logo}
  <p style="margin:0;color:${accent};font-size:20px;font-weight:700">Slipdesk</p>
  <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:13px">${company}</p>
</td></tr>
<tr><td style="padding:28px">${opts.bodyHtml}</td></tr>
<tr><td style="padding:0 28px 28px;border-top:1px solid #f1f5f9">
  <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">Sent by Slipdesk for ${company}. This is a transactional message.</p>
  ${footer}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function ctaButton(url: string, label: string, accent = "#50C878"): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;margin-top:20px;padding:12px 22px;background:${accent};color:#002147;text-decoration:none;font-weight:700;border-radius:10px;font-size:14px">${escapeHtml(label)}</a>`;
}

export function renderWelcomeEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const company = escapeHtml(v.companyName);
  const html = shell({
    title: "Welcome to Slipdesk",
    preheader: `Your employee portal for ${v.companyName} is ready`,
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Welcome, ${name}</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Your self-service portal for <strong>${company}</strong> is ready. Sign in with your phone number and the PIN from HR.
      </p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "Open portal") : ""}
    `,
  });
  return {
    subject: `Welcome to ${v.companyName} on Slipdesk`,
    html,
    text: `Welcome, ${v.employeeName}. Your portal for ${v.companyName} is ready. ${v.ctaUrl ?? ""}`,
  };
}

export function renderPayslipReadyEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const period = escapeHtml(v.periodLabel || "this period");
  const company = escapeHtml(v.companyName);
  const html = shell({
    title: "Payslip ready",
    preheader: `Your payslip for ${v.periodLabel || "this period"} is ready`,
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Your payslip is ready</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Hi ${name}, your payslip for <strong>${period}</strong> from <strong>${company}</strong> is available in the employee portal.
      </p>
      <p style="margin:12px 0 0;color:#64748b;font-size:13px">This secure link expires in 24 hours and can be used once.</p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "View Payslip") : ""}
    `,
  });
  return {
    subject: "Your Slipdesk Payslip is Ready",
    html,
    text: `Hi ${v.employeeName}, your payslip for ${v.periodLabel || "this period"} from ${v.companyName} is ready. View: ${v.ctaUrl ?? ""}`,
  };
}

export function renderPasswordResetEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const html = shell({
    title: "Reset your password",
    preheader: "Reset your Slipdesk employee portal password",
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Reset your password</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Hi ${name}, we received a request to reset your employee portal password. This link expires in 1 hour and can be used once.
      </p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "Choose a new password") : ""}
      <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">If you did not request this, you can ignore this email. Your password will stay the same.</p>
    `,
  });
  return {
    subject: "Reset your Slipdesk portal password",
    html,
    text: `Hi ${v.employeeName}, reset your portal password: ${v.ctaUrl ?? ""}`,
  };
}

export function renderPasswordChangedEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const html = shell({
    title: "Password changed",
    preheader: "Your Slipdesk portal password was changed",
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Password updated</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Hi ${name}, your employee portal password was changed successfully. If this wasn’t you, contact HR immediately.
      </p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "Sign in") : ""}
    `,
  });
  return {
    subject: "Your Slipdesk portal password was changed",
    html,
    text: `Hi ${v.employeeName}, your portal password was changed. If this wasn’t you, contact HR.`,
  };
}

export function renderLeaveSubmittedEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const dates = escapeHtml(v.leaveDates || "");
  const type = escapeHtml(v.leaveType || "leave");
  const html = shell({
    title: "Leave request submitted",
    preheader: `${v.employeeName} submitted a leave request`,
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Leave request to review</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        <strong>${name}</strong> submitted a <strong>${type}</strong> request${dates ? ` for <strong>${dates}</strong>` : ""}${v.leaveDays ? ` (${escapeHtml(v.leaveDays)} day(s))` : ""}.
      </p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "Review leave") : ""}
    `,
  });
  return {
    subject: `Leave request from ${v.employeeName}`,
    html,
    text: `${v.employeeName} submitted ${v.leaveType} leave ${v.leaveDates ?? ""}. ${v.ctaUrl ?? ""}`,
  };
}

export function renderLeaveApprovedEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const html = shell({
    title: "Leave approved",
    preheader: "Your leave request was approved",
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Leave approved</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Hi ${name}, your ${escapeHtml(v.leaveType || "leave")} request${v.leaveDates ? ` for <strong>${escapeHtml(v.leaveDates)}</strong>` : ""} was approved.
      </p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "View leave") : ""}
    `,
  });
  return {
    subject: "Your leave request was approved",
    html,
    text: `Hi ${v.employeeName}, your leave was approved. ${v.leaveDates ?? ""}`,
  };
}

export function renderLeaveRejectedEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const note = v.hrNote ? `<p style="margin:12px 0 0;color:#64748b;font-size:13px">HR note: ${escapeHtml(v.hrNote)}</p>` : "";
  const html = shell({
    title: "Leave rejected",
    preheader: "Your leave request was not approved",
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Leave not approved</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Hi ${name}, your ${escapeHtml(v.leaveType || "leave")} request${v.leaveDates ? ` for <strong>${escapeHtml(v.leaveDates)}</strong>` : ""} was rejected.
      </p>
      ${note}
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "View leave") : ""}
    `,
  });
  return {
    subject: "Your leave request was rejected",
    html,
    text: `Hi ${v.employeeName}, your leave was rejected. ${v.hrNote ?? ""}`,
  };
}

export function renderLeaveInfoRequestedEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const note = v.hrNote ? `<p style="margin:12px 0 0;color:#64748b;font-size:13px">HR asked: ${escapeHtml(v.hrNote)}</p>` : "";
  const html = shell({
    title: "More information needed",
    preheader: "HR needs more information about your leave request",
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Additional information needed</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Hi ${name}, HR needs more information about your leave request before it can be decided.
      </p>
      ${note}
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "Update request") : ""}
    `,
  });
  return {
    subject: "More information needed for your leave request",
    html,
    text: `Hi ${v.employeeName}, HR needs more info on your leave. ${v.hrNote ?? ""}`,
  };
}

export function renderAttendanceMissingClockoutEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const html = shell({
    title: "Missing clock-out",
    preheader: "Please complete your attendance record",
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Missing clock-out</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Hi ${name}, you have an open attendance record${v.workDate ? ` for <strong>${escapeHtml(v.workDate)}</strong>` : ""} without a clock-out.
      </p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "Complete attendance") : ""}
    `,
  });
  return {
    subject: "Missing clock-out on Slipdesk",
    html,
    text: `Hi ${v.employeeName}, missing clock-out ${v.workDate ?? ""}.`,
  };
}

export function renderAttendanceCorrectedEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const html = shell({
    title: "Attendance corrected",
    preheader: "Your attendance record was updated by HR",
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Attendance updated</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Hi ${name}, HR corrected your attendance${v.workDate ? ` for <strong>${escapeHtml(v.workDate)}</strong>` : ""}${v.hoursWorked ? ` (${escapeHtml(v.hoursWorked)} hours)` : ""}.
      </p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "View attendance") : ""}
    `,
  });
  return {
    subject: "Your attendance was corrected",
    html,
    text: `Hi ${v.employeeName}, attendance corrected ${v.workDate ?? ""}.`,
  };
}

export function renderLeaveBalanceLowEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const html = shell({
    title: "Leave balance low",
    preheader: "Your leave balance is running low",
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Leave balance low</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Hi ${name}, your ${escapeHtml(v.leaveType || "leave")} balance is low${v.remaining != null ? ` (${escapeHtml(v.remaining)} day(s) remaining)` : ""}.
      </p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "View leave") : ""}
    `,
  });
  return {
    subject: "Your leave balance is low",
    html,
    text: `Hi ${v.employeeName}, leave balance low: ${v.remaining ?? ""} days.`,
  };
}

export function renderLeaveBalanceExhaustedEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const name = escapeHtml(v.employeeName);
  const html = shell({
    title: "Leave balance exhausted",
    preheader: "Your leave balance is exhausted",
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Leave fully used</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        Hi ${name}, your ${escapeHtml(v.leaveType || "leave")} balance has been fully used.
      </p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "View leave") : ""}
    `,
  });
  return {
    subject: "Your leave balance is exhausted",
    html,
    text: `Hi ${v.employeeName}, ${v.leaveType} leave balance exhausted.`,
  };
}

export function renderPayrollValidationWarningEmail(v: TemplateVars): { subject: string; html: string; text: string } {
  const html = shell({
    title: "Payroll validation warnings",
    preheader: "Review payroll validation warnings before approving",
    branding: { ...v.branding, companyName: v.companyName },
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#002147">Payroll needs review</h1>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.55">
        ${escapeHtml(v.validationSummary || "Validation warnings were found for the current pay period.")}
      </p>
      ${v.ctaUrl ? ctaButton(v.ctaUrl, v.ctaLabel || "Open payroll") : ""}
    `,
  });
  return {
    subject: "Payroll validation warnings",
    html,
    text: v.validationSummary ?? "Payroll validation warnings",
  };
}

export function renderTemplate(
  key: TemplateKey,
  vars: TemplateVars,
) {
  switch (key) {
    case "welcome":
      return renderWelcomeEmail(vars);
    case "payslip_ready":
      return renderPayslipReadyEmail(vars);
    case "password_reset":
      return renderPasswordResetEmail(vars);
    case "password_changed":
      return renderPasswordChangedEmail(vars);
    case "leave_submitted":
      return renderLeaveSubmittedEmail(vars);
    case "leave_approved":
      return renderLeaveApprovedEmail(vars);
    case "leave_rejected":
      return renderLeaveRejectedEmail(vars);
    case "leave_info_requested":
      return renderLeaveInfoRequestedEmail(vars);
    case "attendance_missing_clockout":
    case "attendance_auto_missing_clockout":
      return renderAttendanceMissingClockoutEmail(vars);
    case "attendance_corrected":
      return renderAttendanceCorrectedEmail(vars);
    case "leave_balance_low":
      return renderLeaveBalanceLowEmail(vars);
    case "leave_balance_exhausted":
      return renderLeaveBalanceExhaustedEmail(vars);
    case "payroll_validation_warning":
      return renderPayrollValidationWarningEmail(vars);
  }
}
