import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { resendFromAddress } from "@/lib/email/resend-from";
import { resolveResendPlan, fitsDailyCap, type ResendTierDecision } from "@/lib/email/resend-tier";

export interface PayslipAttachment {
  /** Recipient email */
  to: string;
  /** Employee display name */
  employeeName: string;
  /** PDF filename e.g. Jane_Doe_Payslip_Jul_2026.pdf */
  filename: string;
  /** Base64-encoded PDF (no data: prefix) */
  contentBase64: string;
}

export interface SendPayslipsResult {
  sent: number;
  failed: number;
  skipped: number;
  plan: ResendTierDecision;
  errors: string[];
}

async function detectPayingCustomer(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (admin as any)
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("subscription_status", "active");
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Email payslip PDFs via Resend. Uses Free tier until a paying customer exists
 * (or RESEND_PLAN_TIER=pro is set).
 */
export async function sendPayslipEmails(
  attachments: PayslipAttachment[],
  opts?: { companyName?: string; periodLabel?: string; emailFooter?: string },
): Promise<SendPayslipsResult> {
  if (!process.env.RESEND_API_KEY) {
    return {
      sent: 0,
      failed: 0,
      skipped: attachments.length,
      plan: resolveResendPlan({ hasPayingCustomer: false }),
      errors: ["RESEND_API_KEY is not configured"],
    };
  }

  const hasPayingCustomer = await detectPayingCustomer();
  const plan = resolveResendPlan({ hasPayingCustomer });

  if (!fitsDailyCap(attachments.length, plan) && plan.plan === "free") {
    return {
      sent: 0,
      failed: 0,
      skipped: attachments.length,
      plan,
      errors: [
        `Free tier soft cap is ${plan.dailySoftCap}/day. Split the send or upgrade after first paying customer.`,
      ],
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = resendFromAddress();
  const company = opts?.companyName ?? "your company";
  const period = opts?.periodLabel ?? "this period";
  const footer = opts?.emailFooter?.trim();

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of attachments) {
    const to = item.to.trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      failed += 1;
      errors.push(`${item.employeeName}: missing or invalid email`);
      continue;
    }
    try {
      const result = await resend.emails.send({
        from,
        to,
        subject: `Your payslip — ${period} · ${company}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px">
            <div style="background:#002147;padding:20px 24px;border-radius:12px;margin-bottom:24px">
              <h1 style="color:#50C878;margin:0;font-size:22px">Slipdesk</h1>
              <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px">Payslip delivery</p>
            </div>
            <p style="color:#1e293b;font-size:15px">Hi ${escapeHtml(item.employeeName)},</p>
            <p style="color:#475569;font-size:14px;line-height:1.6">
              Your payslip for <strong>${escapeHtml(period)}</strong> from
              <strong>${escapeHtml(company)}</strong> is attached as a PDF.
            </p>
            <p style="color:#94a3b8;font-size:12px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px">
              ${footer ? escapeHtml(footer) + "<br/>" : ""}
              This message was sent securely via Slipdesk. Do not reply to this email.
            </p>
          </div>
        `,
        attachments: [
          {
            filename: item.filename,
            content: item.contentBase64,
          },
        ],
      });
      if (result.error) {
        failed += 1;
        errors.push(`${item.employeeName}: ${result.error.message}`);
      } else {
        sent += 1;
      }
    } catch (err) {
      failed += 1;
      errors.push(`${item.employeeName}: ${err instanceof Error ? err.message : "send failed"}`);
    }
  }

  return { sent, failed, skipped: 0, plan, errors };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
