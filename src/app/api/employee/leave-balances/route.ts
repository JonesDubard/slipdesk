import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLinkedEmployee } from "@/lib/employee-portal/session";
import { listEmployeeBalances, ensureLeaveBalance } from "@/lib/leave/balance-service";
import type { LeaveType } from "@/lib/leave/leave";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  if (!linked) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const year = new Date().getUTCFullYear();
  for (const leaveType of ["annual", "sick", "maternity", "other"] as LeaveType[]) {
    await ensureLeaveBalance({
      companyId: linked.companyId,
      employeeId: linked.id,
      leaveType,
      year,
    });
  }
  const balances = await listEmployeeBalances(linked.id, year);
  return NextResponse.json({ balances, year });
}
