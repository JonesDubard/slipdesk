import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, normalizeRole } from "@/lib/rbac";

async function resolveHr(userId: string) {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: owned } = await db
    .from("companies")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (owned?.id) return { companyId: owned.id as string, role: "company_owner", admin };
  const { data: member } = await db
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (member?.company_id) {
    return { companyId: member.company_id as string, role: normalizeRole(member.role), admin };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hr = await resolveHr(user.id);
  if (!hr || !can(hr.role as import("@/lib/rbac").Role, "notifications:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const channel = req.nextUrl.searchParams.get("channel") ?? "email";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (hr.admin as any)
    .from("notification_logs")
    .select("*, employees(full_name, employee_number, email)")
    .eq("company_id", hr.companyId)
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (data ?? []) as any[];
  if (q) {
    rows = rows.filter((r) => {
      const hay = `${r.recipient} ${r.employees?.full_name ?? ""} ${r.employees?.employee_number ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const counts = { sent: 0, delivered: 0, failed: 0, pending: 0, skipped: 0 };
  for (const r of rows) {
    if (r.status in counts) counts[r.status as keyof typeof counts]++;
  }

  return NextResponse.json({
    counts,
    logs: rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      provider: r.provider,
      templateKey: r.template_key,
      eventType: r.event_type,
      recipient: r.recipient,
      status: r.status,
      attempt: r.attempt,
      providerMessageId: r.provider_message_id,
      errorReason: r.error_reason,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      employeeName: r.employees?.full_name ?? null,
      employeeNumber: r.employees?.employee_number ?? null,
    })),
  });
}
