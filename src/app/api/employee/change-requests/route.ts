import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnEmployee, resolveLinkedEmployee } from "@/lib/employee-portal/session";
import {
  isChangeRequestFieldType,
  mapChangeRequestRow,
  snapshotOldValue,
  validateChangeRequestPayload,
  type ChangeRequestFieldType,
} from "@/lib/employee-portal/change-requests";
import { logAuditServer } from "@/lib/audit-server";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  const requestedId = req.nextUrl.searchParams.get("employeeId");
  const gate = assertOwnEmployee(linked, requestedId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("employee_change_requests")
    .select("*")
    .eq("employee_id", gate.employee.id)
    .eq("company_id", gate.employee.companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requests: ((data ?? []) as any[]).map(mapChangeRequestRow),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  const body = await req.json().catch(() => ({}));
  const gate = assertOwnEmployee(linked, body.employeeId ?? null);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const blocked = await assertNotDemoCompany(admin, gate.employee.companyId);
  if (blocked) return blocked;

  if (!isChangeRequestFieldType(body.fieldType)) {
    return NextResponse.json(
      { error: "fieldType must be address, bank_details, or phone." },
      { status: 400 },
    );
  }
  const fieldType = body.fieldType as ChangeRequestFieldType;
  const newValue = (body.newValue ?? {}) as Record<string, unknown>;
  const validationError = validateChangeRequestPayload(fieldType, newValue);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const oldValue = snapshotOldValue(fieldType, gate.employee);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("employee_change_requests")
    .insert({
      company_id: gate.employee.companyId,
      employee_id: gate.employee.id,
      requested_by: user.id,
      field_type: fieldType,
      old_value: oldValue,
      new_value: newValue,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAuditServer(admin, {
    companyId: gate.employee.companyId,
    action: "employee.change_request",
    entityType: "employee_change_request",
    entityId: data.id,
    actorId: user.id,
    actorEmail: user.email,
    oldValue,
    newValue: { fieldType, ...newValue },
  });

  return NextResponse.json({ request: mapChangeRequestRow(data) }, { status: 201 });
}
