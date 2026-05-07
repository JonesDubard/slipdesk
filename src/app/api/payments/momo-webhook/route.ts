import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const payload = await req.json();

    // The MTN callback typically sends: { referenceId, status, amount, ... }
    const { referenceId, status } = payload;

    if (!referenceId || !status) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // 1. Fetch the payment record
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("id, company_id, amount, status, tier_requested")
      .eq("reference_id", referenceId)
      .single();

    if (fetchError || !payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // 2. If already confirmed, ignore
    if (payment.status === "confirmed") {
      return NextResponse.json({ received: true });
    }

    // 3. Update payment status
    const newStatus = status === "SUCCESSFUL" ? "confirmed" : "failed";
    await supabase
      .from("payments")
      .update({ status: newStatus })
      .eq("id", payment.id);

    // 4. If successful, activate subscription
    if (newStatus === "confirmed") {
      const now = new Date();
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      await supabase
        .from("companies")
        .update({
          subscription_status: "active",
          subscription_tier: payment.tier_requested,
          subscription_expires_at: expiry.toISOString(),
          trial_expires_at: null,
          is_locked: false,
          locked_reason: null,
          billing_bypass: false,
        })
        .eq("id", payment.company_id);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}