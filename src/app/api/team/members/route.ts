import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!company) return NextResponse.json({ members: [] });

  const { data, error } = await supabase
    .from("company_members")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: true });

  if (error) {
    const msg = error.message ?? "Failed to load team.";
    if (msg.toLowerCase().includes("does not exist")) {
      return NextResponse.json({ members: [], warning: "Apply platform migrations in Supabase." });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({
    members: (data ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      role: r.role,
      invitedEmail: r.invited_email,
      status: r.status ?? "pending",
      createdAt: r.created_at,
    })),
  });
}
