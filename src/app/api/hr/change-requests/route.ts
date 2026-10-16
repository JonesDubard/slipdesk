import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canReviewChangeRequests } from "@/lib/employee-portal/session";
import { mapChangeRequestRow } from "@/lib/employee-portal/change-requests";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";

/** HR / owner queue — lists pending (and optionally all) change requests for the company. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveAppCompanyAccess(user.id);
  if (!ctx || !canReviewChangeRequests(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (ctx.admin as any)
    .from("employee_change_requests")
    .select("*, employees(full_name, employee_number)")
    .eq("company_id", ctx.companyId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requests: ((data ?? []) as any[]).map((row) => ({
      ...mapChangeRequestRow(row),
      employeeName: row.employees?.full_name ?? null,
      employeeNumber: row.employees?.employee_number ?? null,
    })),
  });
}
