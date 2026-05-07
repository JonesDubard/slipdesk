import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateMonthlyFee } from "@/lib/billing/tiered-pricing";
import { requestToPay } from "@/lib/mtn-momo/client";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 2. Get company data
    const { data: company } = await supabase
      .from("companies")
      .select("id, mtn_momo_phone, subscription_status, subscription_tier, trial_expires_at, billing_bypass")
      .eq("owner_id", user.id)
      .single();

    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    if (!company.mtn_momo_phone) {
      return NextResponse.json({ error: "No MTN MoMo phone number set for company. Please update your settings." }, { status: 400 });
    }

    const { tierRequested } = await req.json();
    if (!tierRequested || !["basic", "standard", "premium"].includes(tierRequested)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // 3. Count active employees and calculate fee
    const { count: employeeCount } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("is_archived", false);

    const fee = calculateMonthlyFee(employeeCount || 0);
    const referenceId = uuidv4();
    const currency = "USD"; // MTN sandbox uses EUR; you may need to map in production

    // 4. Send payment request to MTN
    try {
  const success = await requestToPay(company.mtn_momo_phone, fee, referenceId, currency);
  if (!success) {
    return NextResponse.json({ error: "Could not initiate payment. Try again later." }, { status: 502 });
  }
} catch (err) {
  console.error("MTN API call failed:", err);
  return NextResponse.json({
    error: "MTN Mobile Money is temporarily unavailable. Please try again in a few minutes or use the manual payment method."
  }, { status: 502 });
}

    // 5. Insert pending payment record
    const { error: insertError } = await supabase.from("payments").insert({
      company_id: company.id,
      amount: fee,
      reference_id: referenceId,
      status: "pending",
      tier_requested: tierRequested,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Failed to insert payment record:", insertError);
      // Payment request was sent but we couldn't record it — still return success
    }

    return NextResponse.json({ referenceId, amount: fee, message: "Payment request sent. Please check your phone to approve." });
  } catch (err) {
    console.error("Momo payment error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}