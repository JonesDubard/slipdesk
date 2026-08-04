/**
 * Leave balance persistence + policy helpers.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { LeaveType } from "@/lib/leave/leave";
import {
  applyBalanceDelta,
  approvePending,
  canReservePending,
  computeRemaining,
  emptyBalance,
  isExhausted,
  isLowBalance,
  releasePending,
  tracksBalance,
  type LeaveBalance,
} from "@/lib/leave/balances";
import { logAuditServer } from "@/lib/audit-server";
import {
  notifyLeaveBalanceExhausted,
  notifyLeaveBalanceLow,
} from "@/lib/notifications/leave-attendance-notify";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

function mapBalance(row: Record<string, unknown>): LeaveBalance {
  return {
    companyId: String(row.company_id),
    employeeId: String(row.employee_id),
    leaveType: row.leave_type as LeaveType,
    year: Number(row.year),
    allocated: Number(row.allocated),
    used: Number(row.used),
    pending: Number(row.pending),
    remaining: Number(row.remaining),
  };
}

async function getPolicy(
  db: AnyClient,
  companyId: string,
  leaveType: LeaveType,
): Promise<{ tracks: boolean; allocation: number | null; lowThreshold: number; allowNegative: boolean }> {
  const { data } = await db
    .from("leave_policies")
    .select("*")
    .eq("company_id", companyId)
    .eq("leave_type", leaveType)
    .maybeSingle();
  if (!data) {
    return {
      tracks: leaveType !== "unpaid",
      allocation: null,
      lowThreshold: 2,
      allowNegative: false,
    };
  }
  return {
    tracks: Boolean(data.tracks_balance) && leaveType !== "unpaid",
    allocation: data.annual_allocation != null ? Number(data.annual_allocation) : null,
    lowThreshold: Number(data.low_balance_threshold ?? 2),
    allowNegative: Boolean(data.allow_negative),
  };
}

export async function ensureLeaveBalance(opts: {
  companyId: string;
  employeeId: string;
  leaveType: LeaveType;
  year?: number;
}): Promise<LeaveBalance> {
  const year = opts.year ?? new Date().getUTCFullYear();
  const admin = createAdminClient() as AnyClient;
  const { data } = await admin
    .from("leave_balances")
    .select("*")
    .eq("employee_id", opts.employeeId)
    .eq("leave_type", opts.leaveType)
    .eq("year", year)
    .maybeSingle();
  if (data) return mapBalance(data);

  const policy = await getPolicy(admin, opts.companyId, opts.leaveType);
  const allocated = policy.allocation ?? 0;
  const bal = emptyBalance(opts.companyId, opts.employeeId, opts.leaveType, year, allocated);
  const { data: inserted } = await admin
    .from("leave_balances")
    .insert({
      company_id: opts.companyId,
      employee_id: opts.employeeId,
      leave_type: opts.leaveType,
      year,
      allocated: bal.allocated,
      used: 0,
      pending: 0,
      remaining: bal.remaining,
    })
    .select("*")
    .single();
  return inserted ? mapBalance(inserted) : bal;
}

async function persistBalance(
  db: AnyClient,
  bal: LeaveBalance,
  ledger: {
    deltaAllocated?: number;
    deltaUsed?: number;
    deltaPending?: number;
    reason: string;
    leaveRequestId?: string;
    actorId?: string;
  },
) {
  await db
    .from("leave_balances")
    .upsert(
      {
        company_id: bal.companyId,
        employee_id: bal.employeeId,
        leave_type: bal.leaveType,
        year: bal.year,
        allocated: bal.allocated,
        used: bal.used,
        pending: bal.pending,
        remaining: bal.remaining,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,leave_type,year" },
    );

  await db.from("leave_balance_ledger").insert({
    company_id: bal.companyId,
    employee_id: bal.employeeId,
    leave_type: bal.leaveType,
    year: bal.year,
    delta_allocated: ledger.deltaAllocated ?? 0,
    delta_used: ledger.deltaUsed ?? 0,
    delta_pending: ledger.deltaPending ?? 0,
    reason: ledger.reason,
    leave_request_id: ledger.leaveRequestId ?? null,
    actor_id: ledger.actorId ?? null,
  });

  await logAuditServer(db, {
    companyId: bal.companyId,
    action: "leave.balance_change",
    entityType: "leave_balance",
    entityId: bal.employeeId,
    actorId: ledger.actorId ?? null,
    newValue: {
      leaveType: bal.leaveType,
      year: bal.year,
      remaining: bal.remaining,
      reason: ledger.reason,
    },
  });
}

async function maybeNotifyBalance(bal: LeaveBalance, lowThreshold: number, notify: boolean) {
  if (!notify) return;
  const admin = createAdminClient() as AnyClient;
  const { data: emp } = await admin
    .from("employees")
    .select("full_name, email")
    .eq("id", bal.employeeId)
    .maybeSingle();
  const { data: company } = await admin
    .from("companies")
    .select("name, logo_url, brand_primary_color, brand_secondary_color, email_footer")
    .eq("id", bal.companyId)
    .maybeSingle();
  const branding = {
    companyName: company?.name ?? "Slipdesk",
    logoUrl: company?.logo_url,
    primaryColor: company?.brand_primary_color,
    secondaryColor: company?.brand_secondary_color,
    footer: company?.email_footer,
  };
  if (isExhausted(bal)) {
    void notifyLeaveBalanceExhausted({
      companyId: bal.companyId,
      employeeId: bal.employeeId,
      employeeName: emp?.full_name ?? "Employee",
      recipient: emp?.email ?? "",
      companyName: company?.name ?? "your company",
      leaveType: bal.leaveType,
      remaining: String(bal.remaining),
      branding,
    });
  } else if (isLowBalance(bal, lowThreshold)) {
    void notifyLeaveBalanceLow({
      companyId: bal.companyId,
      employeeId: bal.employeeId,
      employeeName: emp?.full_name ?? "Employee",
      recipient: emp?.email ?? "",
      companyName: company?.name ?? "your company",
      leaveType: bal.leaveType,
      remaining: String(bal.remaining),
      branding,
    });
  }
}

export async function reserveLeaveBalance(opts: {
  companyId: string;
  employeeId: string;
  leaveType: LeaveType;
  days: number;
  leaveRequestId?: string;
  actorId?: string;
}): Promise<{ ok: true; balance: LeaveBalance } | { ok: false; error: string }> {
  if (!tracksBalance(opts.leaveType)) {
    return { ok: true, balance: emptyBalance(opts.companyId, opts.employeeId, opts.leaveType, new Date().getUTCFullYear()) };
  }
  const admin = createAdminClient() as AnyClient;
  const policy = await getPolicy(admin, opts.companyId, opts.leaveType);
  if (!policy.tracks) {
    return { ok: true, balance: emptyBalance(opts.companyId, opts.employeeId, opts.leaveType, new Date().getUTCFullYear()) };
  }

  let bal = await ensureLeaveBalance(opts);
  const check = canReservePending(bal, opts.days, policy.allowNegative);
  if (!check.ok) return check;

  bal = applyBalanceDelta(bal, { pending: opts.days });
  await persistBalance(admin, bal, {
    deltaPending: opts.days,
    reason: "leave_submitted",
    leaveRequestId: opts.leaveRequestId,
    actorId: opts.actorId,
  });
  return { ok: true, balance: bal };
}

export async function finalizeLeaveBalanceOnApprove(opts: {
  companyId: string;
  employeeId: string;
  leaveType: LeaveType;
  days: number;
  leaveRequestId?: string;
  actorId?: string;
}): Promise<void> {
  if (!tracksBalance(opts.leaveType)) return;
  const admin = createAdminClient() as AnyClient;
  const policy = await getPolicy(admin, opts.companyId, opts.leaveType);
  if (!policy.tracks) return;
  let bal = await ensureLeaveBalance(opts);
  bal = approvePending(bal, opts.days);
  await persistBalance(admin, bal, {
    deltaPending: -opts.days,
    deltaUsed: opts.days,
    reason: "leave_approved",
    leaveRequestId: opts.leaveRequestId,
    actorId: opts.actorId,
  });
  const { data: cfg } = await admin
    .from("company_attendance_config")
    .select("low_balance_notify")
    .eq("company_id", opts.companyId)
    .maybeSingle();
  await maybeNotifyBalance(bal, policy.lowThreshold, cfg?.low_balance_notify !== false);
}

export async function releaseLeaveBalance(opts: {
  companyId: string;
  employeeId: string;
  leaveType: LeaveType;
  days: number;
  leaveRequestId?: string;
  actorId?: string;
  reason?: string;
}): Promise<void> {
  if (!tracksBalance(opts.leaveType)) return;
  const admin = createAdminClient() as AnyClient;
  const policy = await getPolicy(admin, opts.companyId, opts.leaveType);
  if (!policy.tracks) return;
  let bal = await ensureLeaveBalance(opts);
  bal = releasePending(bal, opts.days);
  await persistBalance(admin, bal, {
    deltaPending: -opts.days,
    reason: opts.reason ?? "leave_released",
    leaveRequestId: opts.leaveRequestId,
    actorId: opts.actorId,
  });
}

export async function listEmployeeBalances(employeeId: string, year?: number): Promise<LeaveBalance[]> {
  const admin = createAdminClient() as AnyClient;
  const y = year ?? new Date().getUTCFullYear();
  const { data } = await admin
    .from("leave_balances")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("year", y);
  return (data ?? []).map((r: Record<string, unknown>) => mapBalance(r));
}

export async function upsertLeavePolicy(opts: {
  companyId: string;
  leaveType: LeaveType;
  annualAllocation: number | null;
  tracksBalance?: boolean;
  lowBalanceThreshold?: number;
  allowNegative?: boolean;
  actorId?: string;
}) {
  const admin = createAdminClient() as AnyClient;
  await admin.from("leave_policies").upsert(
    {
      company_id: opts.companyId,
      leave_type: opts.leaveType,
      annual_allocation: opts.annualAllocation,
      tracks_balance: opts.tracksBalance ?? opts.leaveType !== "unpaid",
      low_balance_threshold: opts.lowBalanceThreshold ?? 2,
      allow_negative: opts.allowNegative ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,leave_type" },
  );
  await logAuditServer(admin, {
    companyId: opts.companyId,
    action: "leave.policy_update",
    entityType: "leave_policy",
    entityId: opts.leaveType,
    actorId: opts.actorId ?? null,
    newValue: opts,
  });
}

export { computeRemaining };
