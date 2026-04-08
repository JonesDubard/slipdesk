import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { referenceId, status, amount } = body;

    // Update your payments table and company subscription
    const supabase = await createClient();
    if (status === "SUCCESSFUL") {
      await supabase.from("payments").update({ status: "completed" }).eq("reference_id", referenceId);
      // Also update company subscription status to 'active' and set trial expiry to null or extend
      // You'll need to get company_id from the payments record
    } else {
      await supabase.from("payments").update({ status: "failed" }).eq("reference_id", referenceId);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}