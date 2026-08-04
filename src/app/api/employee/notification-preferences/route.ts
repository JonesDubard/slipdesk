import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLinkedEmployee } from "@/lib/employee-portal/session";
import { ensureDefaultEmailPreferences } from "@/lib/notifications/service";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  if (!linked) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await ensureDefaultEmailPreferences(linked.id, linked.companyId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from("notification_preferences")
    .select("*")
    .eq("employee_id", linked.id)
    .order("channel")
    .order("event_type");

  return NextResponse.json({
    preferences: data ?? [],
    email: linked.email,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  if (!linked) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const eventType = String(body.eventType ?? "");
  const channel = String(body.channel ?? "email");
  const enabled = Boolean(body.enabled);

  if (channel !== "email") {
    return NextResponse.json({ error: "Only email preferences can be changed in this release." }, { status: 400 });
  }
  if (eventType === "password_reset") {
    return NextResponse.json({ error: "Password reset emails cannot be disabled." }, { status: 400 });
  }
  if (!["payslip_ready", "password_changed", "welcome", "leave_approved", "leave_rejected", "leave_info_requested", "attendance_missing_clockout", "attendance_corrected"].includes(eventType)) {
    return NextResponse.json({ error: "Invalid event type." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("notification_preferences")
    .upsert(
      {
        employee_id: linked.id,
        company_id: linked.companyId,
        channel: "email",
        event_type: eventType,
        enabled,
        available: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,channel,event_type" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
