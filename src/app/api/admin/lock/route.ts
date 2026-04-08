import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({}));
  const { companyId, action, reason } = body;
  // action: "lock" | "unlock"

  if (!companyId || !["lock", "unlock"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { error } = await supabase
    .from("companies")
    .update({
      is_locked:     action === "lock",
      locked_reason: action === "lock" ? (reason ?? "Account locked by admin") : null,
    })
    .eq("id", companyId);

  if (error) {
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }

  return NextResponse.json({ success: true, action });
}