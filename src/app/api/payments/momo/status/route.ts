import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const referenceId = searchParams.get("referenceId");

  if (!referenceId) {
    return NextResponse.json({ error: "Missing referenceId" }, { status: 400 });
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("status, tier_requested")
    .eq("reference_id", referenceId)
    .single();

  if (!payment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ status: payment.status, tierRequested: payment.tier_requested });
}