/**
 * Slipdesk — Audit logging
 *
 * Records every critical action to the `audit_log` table. Designed to be
 * fire-and-forget and completely non-blocking: if the table does not exist yet
 * (migration 0001 not applied) or the write fails, it logs a warning and the
 * calling flow continues unaffected. Audit must never break a user action.
 */

import { createClient } from "@/lib/supabase/client";

export type AuditAction =
  | "employee.create"
  | "employee.update"
  | "employee.archive"
  | "employee.restore"
  | "employee.delete"
  | "employee.salary_change"
  | "company.update"
  | "payroll.create"
  | "payroll.submit"
  | "payroll.approve"
  | "payroll.lock"
  | "payroll.reopen"
  | "payroll.release"
  | "payroll.paid"
  | "report.export"
  | "user.login";

export interface AuditEntry {
  companyId: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  actorId?: string | null;
  actorEmail?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Best-effort audit write. Resolves the current user when actor details are
 * not supplied. Never throws.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  if (!entry.companyId) return;
  try {
    const supabase = createClient() as AnySupabase;

    let actorId = entry.actorId ?? null;
    let actorEmail = entry.actorEmail ?? null;
    if (!actorId) {
      const { data } = await supabase.auth.getUser();
      actorId = data?.user?.id ?? null;
      actorEmail = actorEmail ?? data?.user?.email ?? null;
    }

    const { error } = await supabase.from("audit_log").insert({
      company_id: entry.companyId,
      actor_id: actorId,
      actor_email: actorEmail,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      ip_address: null, // populated server-side if/when routed through an API
    });

    if (error) {
      console.warn("[audit] skipped:", error.message);
    }
  } catch (err) {
    console.warn("[audit] skipped:", err);
  }
}

export interface AuditRecord {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorEmail: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export async function fetchAuditLog(companyId: string, limit = 200): Promise<AuditRecord[]> {
  if (!companyId) return [];
  try {
    const supabase = createClient() as AnySupabase;
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      actorEmail: r.actor_email,
      oldValue: r.old_value,
      newValue: r.new_value,
      ipAddress: r.ip_address,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/** Human-readable label for an audit action. */
export function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    "employee.create": "Employee created",
    "employee.update": "Employee updated",
    "employee.archive": "Employee archived",
    "employee.restore": "Employee restored",
    "employee.delete": "Employee deleted",
    "employee.salary_change": "Salary changed",
    "company.update": "Company settings updated",
    "payroll.create": "Payroll run created",
    "payroll.submit": "Payroll submitted for review",
    "payroll.approve": "Payroll approved",
    "payroll.lock": "Payroll locked",
    "payroll.reopen": "Payroll reopened",
    "payroll.release": "Payslips released",
    "payroll.paid": "Payroll marked paid",
    "report.export": "Report exported",
    "user.login": "User signed in",
  };
  return map[action] ?? action;
}
