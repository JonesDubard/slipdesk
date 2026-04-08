import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { paymentId, receiptNote } = body;

  if (!paymentId) {
    return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
  }

  // Verify this payment belongs to the user's company
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const { error } = await supabase
    .from("payments")
    .update({ receipt_note: receiptNote ?? null })
    .eq("id", paymentId)
    .eq("company_id", company.id)   // RLS enforcement at app level too
    .eq("status", "pending");       // only update if still pending

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}