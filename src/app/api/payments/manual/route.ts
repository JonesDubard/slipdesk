import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { TIERED_PRICING } from "@/lib/billing";
import { resolveCompanyIdForUser, paymentsDb } from "@/lib/payments/server";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tierRequested: string = body.tierRequested ?? "basic";
  if (!["basic", "standard", "premium"].includes(tierRequested)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const companyId = await resolveCompanyIdForUser(supabase, user.id);
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const blocked = await assertNotDemoCompany(supabase, companyId);
  if (blocked) return blocked;

  const tier   = tierRequested as keyof typeof TIERED_PRICING;
  const amount = TIERED_PRICING[tier].price;
  const month  = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  const admin = paymentsDb();
  const { data: payment, error: insertErr } = await admin
    .from("payments")
    .insert({
      company_id:     companyId,
      amount,
      month,
      status:         "pending",
      tier_requested: tier,
    })
    .select("id")
    .single();

  if (insertErr || !payment) {
    console.error("[payments/manual]", insertErr);
    return NextResponse.json({ error: "Failed to create payment record" }, { status: 500 });
  }

  return NextResponse.json({
    paymentId: payment.id,
    amount,
    month,
    tierRequested: tier,
  });
}
