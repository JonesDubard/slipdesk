import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { resendFromAddress } from "@/lib/email/resend-from";
import { resolveCompanyIdForUser, paymentsDb } from "@/lib/payments/server";
import { buildPaymentReceiptUpdate } from "@/lib/payments/receipt";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { paymentId, receiptNote, receiptUrl } = body;

  if (!paymentId) {
    return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
  }

  const companyId = await resolveCompanyIdForUser(supabase, user.id);
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const blocked = await assertNotDemoCompany(supabase, companyId);
  if (blocked) return blocked;

  const admin = paymentsDb();

  const { data: existing } = await admin
    .from("payments")
    .select("id, status")
    .eq("id", paymentId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ error: "Payment already processed" }, { status: 409 });
  }

  const updatePayload = buildPaymentReceiptUpdate(receiptNote, receiptUrl);

  let { data: payment, error } = await admin
    .from("payments")
    .update(updatePayload)
    .eq("id", paymentId)
    .eq("company_id", companyId)
    .eq("status", "pending")
    .select("id, amount, tier_requested, month, receipt_note")
    .maybeSingle();

  // If receipt_url column is missing (migration 0003 not applied), retry without it.
  if (error?.message?.includes("receipt_url")) {
    const { receipt_url: _drop, ...withoutUrl } = updatePayload;
    ({ data: payment, error } = await admin
      .from("payments")
      .update(withoutUrl)
      .eq("id", paymentId)
      .eq("company_id", companyId)
      .eq("status", "pending")
      .select("id, amount, tier_requested, month, receipt_note")
      .maybeSingle());
  }

  // If receipt_note column is missing, retry with reference stored in rejected_reason temporarily — no, add migration instead.
  if (error?.message?.includes("receipt_note")) {
    console.error("[payments/confirm] receipt_note column missing — run migration 0005_payment_receipt_note.sql");
    return NextResponse.json({ error: "Payment reference could not be saved. Contact support." }, { status: 500 });
  }

  if (error) {
    console.error("[payments/confirm]", error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
  if (!payment) {
    return NextResponse.json({ error: "Payment not found or already processed" }, { status: 404 });
  }

  const { data: company } = await admin
    .from("companies")
    .select("name, email")
    .eq("id", companyId)
    .single();

  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const adminTo = process.env.SLIPDESK_ADMIN_EMAIL ?? "helloslipdesk@gmail.com";
      await resend.emails.send({
        from: resendFromAddress(),
        to: adminTo,
        subject: `Manual payment submitted — ${company?.name ?? "Company"}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#002147;margin:0 0 12px">New manual MoMo payment</h2>
            <p style="color:#475569;font-size:14px;margin:0 0 8px"><strong>Company:</strong> ${company?.name ?? "—"}</p>
            <p style="color:#475569;font-size:14px;margin:0 0 8px"><strong>Amount:</strong> $${payment.amount}</p>
            <p style="color:#475569;font-size:14px;margin:0 0 8px"><strong>Plan:</strong> ${payment.tier_requested}</p>
            <p style="color:#475569;font-size:14px;margin:0 0 8px"><strong>Period:</strong> ${payment.month}</p>
            ${receiptNote ? `<p style="color:#475569;font-size:14px;margin:0 0 8px"><strong>TX ID:</strong> ${receiptNote}</p>` : ""}
            ${receiptUrl ? `<p style="margin:16px 0"><a href="${receiptUrl}">View payment screenshot</a></p>` : ""}
            <p style="margin-top:20px"><a href="https://slipdesk.com/admin/payments">Review in admin</a></p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Admin payment notification failed:", emailErr);
    }
  }

  return NextResponse.json({ success: true });
}
