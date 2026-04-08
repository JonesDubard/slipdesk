import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { TIERED_PRICING } from "@/lib/billing";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tierRequested: string = body.tierRequested ?? "basic";
  if (!["basic", "standard", "premium"].includes(tierRequested)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  // Get company
  const { data: company, error: coErr } = await supabase
    .from("companies")
    .select("id, name")
    .eq("owner_id", user.id)
    .single();

  if (coErr || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const tier   = tierRequested as keyof typeof TIERED_PRICING;
  const amount = TIERED_PRICING[tier].price;
  const month  = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  // Insert pending payment
  const { data: payment, error: insertErr } = await supabase
    .from("payments")
    .insert({
      company_id:     company.id,
      amount,
      month,
      status:         "pending",
      tier_requested: tier,
    })
    .select()
    .single();

  if (insertErr || !payment) {
    console.error(insertErr);
    return NextResponse.json({ error: "Failed to create payment record" }, { status: 500 });
  }

  return NextResponse.json({
    paymentId: payment.id,
    amount,
    month,
    tierRequested: tier,
  });
}