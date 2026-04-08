import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("faqs")
    .select("id, question, answer, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    return NextResponse.json([], { status: 200 }); // fail silently — FAQs are non-critical
  }

  return NextResponse.json(data ?? []);
}