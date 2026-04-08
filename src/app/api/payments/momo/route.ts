import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateMonthlyFee } from "@/lib/billing/tiered-pricing";
import { requestToPay } from "@/lib/mtn-momo/client";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get user's profile to find company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json({ error: "No company associated" }, { status: 400 });
    }

    // Get company details and employee count
    const { data: company } = await supabase
      .from("companies")
      .select("mtn_momo_phone, subscription_status")
      .eq("id", profile.company_id)
      .single();

    if (!company?.mtn_momo_phone) {
      return NextResponse.json({ error: "MTN mobile number not set for company" }, { status: 400 });
    }

    const { count: employeeCount } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
      .eq("is_archived", false);

    const fee = calculateMonthlyFee(employeeCount || 0);
    const referenceId = uuidv4();

    const success = await requestToPay(company.mtn_momo_phone, fee, referenceId, "USD");

    if (!success) {
      return NextResponse.json({ error: "Payment request failed" }, { status: 500 });
    }

    // Store pending payment in database (create a payments table if needed)
    await supabase.from("payments").insert({
      company_id: profile.company_id,
      amount: fee,
      reference_id: referenceId,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ referenceId, message: "Payment request sent. Please check your phone to approve." });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}