import { createAdminClient } from "@/lib/supabase/admin";
import { can, normalizeRole, type Role } from "@/lib/rbac";

export type PayRunStatus =
  | "draft"
  | "review"
  | "approved"
  | "locked"
  | "archived"
  | "paid";

/** Statuses where draft autosave is allowed. */
export const DRAFT_AUTOSAVE_STATUSES: PayRunStatus[] = ["draft", "review", "approved"];

/** Statuses that are finalized — never overwrite via draft save. */
export const FINALIZED_PAY_RUN_STATUSES: PayRunStatus[] = ["paid", "locked", "archived"];

export async function resolvePayrollAccess(
  userId: string,
  fallbackClient?: unknown,
) {
  let admin: unknown;
  try {
    admin = createAdminClient();
  } catch {
    if (!fallbackClient) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    admin = fallbackClient;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data: owned } = await db
    .from("companies")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (owned?.id) {
    return { companyId: owned.id as string, role: "company_owner" as Role, admin };
  }

  const { data: member } = await db
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (member?.company_id) {
    return {
      companyId: member.company_id as string,
      role: normalizeRole(member.role),
      admin,
    };
  }

  return null;
}

export function canViewPayroll(role: Role): boolean {
  return can(role, "payroll:view");
}

export function canEditPayrollDraft(role: Role): boolean {
  return can(role, "payroll:edit") || can(role, "payroll:create");
}

export function canFinalizePayroll(role: Role): boolean {
  return can(role, "payroll:release");
}
