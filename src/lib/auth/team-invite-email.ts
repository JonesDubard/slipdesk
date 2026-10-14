import { escapeHtml, roleLabel } from "@/lib/auth/team-invite-policy";
import type { Role } from "@/lib/rbac";

export function teamInviteEmailHtml(opts: {
  companyName: string;
  recipientName: string;
  role: Role;
  inviteUrl: string;
}): string {
  const company = escapeHtml(opts.companyName);
  const name = escapeHtml(opts.recipientName);
  const role = escapeHtml(roleLabel(opts.role));
  const href = escapeHtml(opts.inviteUrl);
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px">
      <div style="background:#002147;padding:20px 24px;border-radius:12px;margin-bottom:24px">
        <h1 style="color:#50C878;margin:0;font-size:22px">Slipdesk</h1>
        <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px">Team invitation</p>
      </div>
      <p style="color:#1e293b;font-size:15px">Hello ${name},</p>
      <p style="color:#1e293b;font-size:15px">You've been invited to join <strong>${company}</strong> on Slipdesk as <strong>${role}</strong>.</p>
      <p style="color:#475569;font-size:14px;line-height:1.6">
        Open the link below and create your own password. This invitation expires in 7 days.
        Slipdesk never emails a password.
      </p>
      <p style="margin:24px 0">
        <a href="${href}" style="background:#002147;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:bold;font-size:14px;display:inline-block">
          Accept invitation
        </a>
      </p>
      <p style="color:#94a3b8;font-size:12px">
        If you already have a Slipdesk account, sign in with this same email after opening the link.
      </p>
    </div>
  `;
}

export function buildInviteUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/signup?token=${encodeURIComponent(token)}`;
}
