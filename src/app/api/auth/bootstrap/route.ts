import { createClient } from "@/lib/supabase/server";
import { bootstrapUserAccount } from "@/lib/auth/bootstrap-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = await bootstrapUserAccount(user, {
    companyName: String(body.companyName ?? ""),
    lraTin:      String(body.lraTin ?? ""),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
