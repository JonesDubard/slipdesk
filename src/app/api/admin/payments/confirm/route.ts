import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { paymentId, action, rejectedReason } = body;

  if (!paymentId || !["confirm", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Fetch the payment
  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("company_id, amount, tier_requested")
    .eq("id", paymentId)
    .single();

  if (fetchErr || !payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // ── Reject ───────────────────────────────────────────────────────────────
  if (action === "reject") {
    await supabase
      .from("payments")
      .update({ status: "rejected", rejected_reason: rejectedReason ?? "Rejected by admin" })
      .eq("id", paymentId);
    return NextResponse.json({ success: true, action: "rejected" });
  }

  // ── Confirm: mark payment row ─────────────────────────────────────────────
  const { error: payErr } = await supabase
    .from("payments")
    .update({
      status:       "confirmed",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (payErr) {
    return NextResponse.json({ error: "Failed to confirm payment" }, { status: 500 });
  }

  // ── Fetch company to calculate new expiry ─────────────────────────────────
  const { data: co } = await supabase
    .from("companies")
    .select("name, admin_email, email, subscription_expires_at")
    .eq("id", payment.company_id)
    .single();

  // Extend by 1 month from current expiry if still in future, otherwise from today
  const base = co?.subscription_expires_at && new Date(co.subscription_expires_at) > new Date()
    ? new Date(co.subscription_expires_at)
    : new Date();
  base.setMonth(base.getMonth() + 1);

  // ── Update company subscription (MUST happen before email) ────────────────
  const { error: coErr } = await supabase
    .from("companies")
    .update({
      subscription_status:     "active",
      subscription_tier:       payment.tier_requested,
      subscription_expires_at: base.toISOString(),
      is_locked:               false,
      locked_reason:           null,
    })
    .eq("id", payment.company_id);

  if (coErr) {
    return NextResponse.json({ error: "Payment confirmed but failed to update company" }, { status: 500 });
  }

  // ── Send confirmation email (after DB is updated — failure here is non-fatal) ──
  const recipientEmail = co?.admin_email || co?.email;
  if (recipientEmail) {
    try {
      const tierLabel = payment.tier_requested.charAt(0).toUpperCase() + payment.tier_requested.slice(1);
      const expiryFormatted = base.toLocaleDateString("en-LR", {
        year: "numeric", month: "long", day: "numeric",
      });

      await resend.emails.send({
        from: "Slipdesk <helloslipdesk@gmail.com>",
        to: recipientEmail,
        subject: `Payment confirmed — your ${tierLabel} plan is now active`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px">
            <div style="background:#002147;padding:20px 24px;border-radius:12px;margin-bottom:24px">
              <h1 style="color:#50C878;margin:0;font-size:22px">Slipdesk</h1>
              <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px">Payment Confirmed</p>
            </div>
            <p style="color:#1e293b;font-size:15px">Hi ${co?.name || "there"},</p>
            <p style="color:#475569;font-size:14px">
              Your payment of <strong style="color:#002147">$${payment.amount}</strong> has been confirmed.
              Your <strong style="color:#002147">${tierLabel} plan</strong> is now active.
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:20px 0">
              <p style="margin:0;font-size:13px;color:#166534">
                <strong>Plan:</strong> ${tierLabel}
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:#166534">
                <strong>Active until:</strong> ${expiryFormatted}
              </p>
            </div>
            <p style="color:#475569;font-size:14px">
              You can now run payroll without any restrictions.
              <a href="https://slipdesk.com/dashboard" style="color:#002147;font-weight:bold">
                Log in to your dashboard →
              </a>
            </p>
            <p style="color:#94a3b8;font-size:12px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px">
              Questions? Reply to this email or contact 
              <a href="mailto:helloslipdesk@gmail.com" style="color:#475569">helloslipdesk@gmail.com</a>
            </p>
          </div>
        `,
      });
    } catch (emailErr) {
      // Email failure is non-fatal — account is already activated
      console.error("Confirmation email failed (account still activated):", emailErr);
    }
  }

  return NextResponse.json({ success: true, action: "confirmed", newExpiry: base.toISOString() });
}