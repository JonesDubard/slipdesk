import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { resendFromAddress } from "@/lib/email/resend-from";
import { isPlatformAdminRole } from "@/lib/auth/platform-admin";
import { paymentsDb } from "@/lib/payments/server";

/** List all payments (platform admin). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!isPlatformAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = paymentsDb();

  const baseSelect = `
    id, amount, month, status, tier_requested,
    receipt_note, created_at, rejected_reason,
    company_id,
    companies ( name, email, admin_email, subscription_tier, subscription_status, is_locked )
  `;

  let { data: payments, error } = await admin
    .from("payments")
    .select(`${baseSelect}, receipt_url`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error?.message?.includes("receipt_url")) {
    ({ data: payments, error } = await admin
      .from("payments")
      .select(baseSelect)
      .order("created_at", { ascending: false })
      .limit(100));
  }

  if (error) {
    console.error("[admin/payments] list:", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }

  return NextResponse.json(payments ?? []);
}

/** Confirm or reject a payment (platform admin). */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!isPlatformAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { paymentId, action, rejectedReason } = body;

  if (!paymentId || !["confirm", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = paymentsDb();

  const { data: payment, error: fetchErr } = await admin
    .from("payments")
    .select("company_id, amount, tier_requested")
    .eq("id", paymentId)
    .single();

  if (fetchErr || !payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (action === "reject") {
    const { error } = await admin
      .from("payments")
      .update({ status: "rejected", rejected_reason: rejectedReason ?? "Rejected by admin" })
      .eq("id", paymentId);
    if (error) return NextResponse.json({ error: "Failed to reject payment" }, { status: 500 });
    return NextResponse.json({ success: true, action: "rejected" });
  }

  const { error: payErr } = await admin
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

  const { data: co } = await admin
    .from("companies")
    .select("name, admin_email, email, subscription_expires_at")
    .eq("id", payment.company_id)
    .single();

  const base = co?.subscription_expires_at && new Date(co.subscription_expires_at) > new Date()
    ? new Date(co.subscription_expires_at)
    : new Date();
  base.setMonth(base.getMonth() + 1);

  const { error: coErr } = await admin
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

  const recipientEmail = co?.admin_email || co?.email;
  if (recipientEmail && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const tierLabel = payment.tier_requested.charAt(0).toUpperCase() + payment.tier_requested.slice(1);
      const expiryFormatted = base.toLocaleDateString("en-LR", {
        year: "numeric", month: "long", day: "numeric",
      });

      await resend.emails.send({
        from: resendFromAddress(),
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
              <p style="margin:0;font-size:13px;color:#166534"><strong>Plan:</strong> ${tierLabel}</p>
              <p style="margin:6px 0 0;font-size:13px;color:#166534"><strong>Active until:</strong> ${expiryFormatted}</p>
            </div>
            <p style="color:#475569;font-size:14px">
              <a href="https://slipdesk.com/dashboard" style="color:#002147;font-weight:bold">Log in to your dashboard →</a>
            </p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Confirmation email failed:", emailErr);
    }
  }

  return NextResponse.json({ success: true, action: "confirmed", newExpiry: base.toISOString() });
}
