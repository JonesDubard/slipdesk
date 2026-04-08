import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: payments, error } = await supabase
    .from("payments")
    .select(`
      id, amount, month, status, tier_requested,
      receipt_note, created_at, rejected_reason,
      company_id,
      companies ( name, email, admin_email, subscription_tier, subscription_status )
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }

  return NextResponse.json(payments ?? []);
}