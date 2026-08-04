/**
 * Leave balance engine — configurable allocations; no Liberian statutory defaults.
 */

import type { LeaveType } from "@/lib/leave/leave";

export type LeaveBalance = {
  employeeId: string;
  companyId: string;
  leaveType: LeaveType;
  year: number;
  allocated: number;
  used: number;
  pending: number;
  remaining: number;
};

export function computeRemaining(allocated: number, used: number, pending: number): number {
  return Math.round((allocated - used - pending) * 100) / 100;
}

export function applyBalanceDelta(
  bal: LeaveBalance,
  delta: { allocated?: number; used?: number; pending?: number },
): LeaveBalance {
  const allocated = bal.allocated + (delta.allocated ?? 0);
  const used = bal.used + (delta.used ?? 0);
  const pending = bal.pending + (delta.pending ?? 0);
  return {
    ...bal,
    allocated,
    used,
    pending,
    remaining: computeRemaining(allocated, used, pending),
  };
}

/** Whether this leave type consumes a tracked balance (unpaid does not). */
export function tracksBalance(leaveType: LeaveType, policyTracks = true): boolean {
  if (leaveType === "unpaid") return false;
  return policyTracks;
}

export function canReservePending(
  bal: LeaveBalance,
  days: number,
  allowNegative: boolean,
): { ok: true } | { ok: false; error: string } {
  if (days <= 0) return { ok: false, error: "Days must be positive." };
  const nextRemaining = computeRemaining(bal.allocated, bal.used, bal.pending + days);
  if (!allowNegative && nextRemaining < 0) {
    return {
      ok: false,
      error: `Insufficient ${bal.leaveType} leave balance (remaining ${bal.remaining} days).`,
    };
  }
  return { ok: true };
}

/** pending → used on approve */
export function approvePending(bal: LeaveBalance, days: number): LeaveBalance {
  return applyBalanceDelta(bal, { pending: -days, used: days });
}

/** release pending on reject/cancel */
export function releasePending(bal: LeaveBalance, days: number): LeaveBalance {
  return applyBalanceDelta(bal, { pending: -Math.min(days, bal.pending) });
}

export function isLowBalance(bal: LeaveBalance, threshold: number): boolean {
  return bal.remaining > 0 && bal.remaining <= threshold;
}

export function isExhausted(bal: LeaveBalance): boolean {
  return bal.remaining <= 0 && bal.allocated > 0;
}

export function emptyBalance(
  companyId: string,
  employeeId: string,
  leaveType: LeaveType,
  year: number,
  allocated = 0,
): LeaveBalance {
  return {
    companyId,
    employeeId,
    leaveType,
    year,
    allocated,
    used: 0,
    pending: 0,
    remaining: allocated,
  };
}
