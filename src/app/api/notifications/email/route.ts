import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { resendFromAddress } from "@/lib/email/resend-from";

/**
 * Sends a branded Slipdesk notification email via Resend.
 *
 * - Requires an authenticated session.
 * - Degrades gracefully: if RESEND_API_KEY is not configured, returns
 *   { skipped: true } with 200 so callers never fail because of email.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    to,
    subject,
    title,
    message,
    ctaUrl,
    ctaLabel,
    footer,
  }: {
    to?: string;
    subject?: string;
    title?: string;
    message?: string;
    ctaUrl?: string;
    ctaLabel?: string;
    footer?: string;
  } = body;

  const recipient = (to ?? "").trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return NextResponse.json({ error: "Valid recipient email required" }, { status: 400 });
  }
  if (!subject || !title) {
    return NextResponse.json({ error: "subject and title are required" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ skipped: true, reason: "RESEND_API_KEY not configured" });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: resendFromAddress(),
      to: recipient,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <div style="background:#002147;padding:20px 24px;border-radius:12px;margin-bottom:24px">
            <h1 style="color:#50C878;margin:0;font-size:22px">Slipdesk</h1>
            <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px">Payroll &amp; Compliance Platform</p>
          </div>
          <h2 style="color:#002147;font-size:18px;margin:0 0 10px">${escapeHtml(title)}</h2>
          ${message ? `<p style="color:#475569;font-size:14px;line-height:1.6">${escapeHtml(message)}</p>` : ""}
          ${ctaUrl ? `
            <p style="margin:24px 0">
              <a href="${escapeAttr(ctaUrl)}" style="background:#002147;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:bold;font-size:14px;display:inline-block">
                ${escapeHtml(ctaLabel || "Open Slipdesk")}
              </a>
            </p>` : ""}
          <p style="color:#94a3b8;font-size:12px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px">
            ${footer ? escapeHtml(footer) + "<br/>" : ""}
            Questions? Contact
            <a href="mailto:helloslipdesk@gmail.com" style="color:#475569">helloslipdesk@gmail.com</a>
          </p>
        </div>
      `,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Notification email failed:", err);
    return NextResponse.json({ error: "Email send failed" }, { status: 502 });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
