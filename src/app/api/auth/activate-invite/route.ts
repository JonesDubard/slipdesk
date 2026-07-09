import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activatePendingInviteForUser } from "@/lib/auth/activate-invite";
import { NextResponse } from "next/server";

/** Activates a pending team invite for the current user (idempotent). */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const result = await activatePendingInviteForUser(admin, user.id, user.email);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[activate-invite]", err);
    return NextResponse.json({ error: "Activation failed" }, { status: 500 });
  }
}
