/**
 * PasswordAuth — HR-assigned PIN/password for the employee portal.
 * Implements AuthMethod. Does not use SMS/WhatsApp/email delivery.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertPasswordInput,
  type AuthInput,
  type AuthMethod,
  type AuthResult,
} from "@/lib/employee-portal/auth-method";
import { normalizeLiberianPhone } from "@/lib/employee-portal/phone";
import { verifyPassword } from "@/lib/employee-portal/password";
import { logEmployeeAuthEvent } from "@/lib/employee-portal/auth-events";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 30 * 60 * 1000;

/** Same text for a bad, unknown, or ambiguous identifier. */
export const GENERIC_LOGIN_ERROR = "Invalid email, phone, or password.";

export function readLoginIdentifier(body: {
  identifier?: unknown;
  email?: unknown;
  phone?: unknown;
}): string {
  return String(body.identifier ?? body.email ?? body.phone ?? "");
}

type PortalEmployee = {
  id: string;
  company_id: string;
  phone_e164: string | null;
  portal_enabled: boolean;
};

export class PasswordAuth implements AuthMethod {
  readonly id = "password" as const;

  async authenticate(input: AuthInput): Promise<AuthResult> {
    assertPasswordInput(input);

    if (!String(input.password ?? "").trim()) {
      return { ok: false, error: "Enter your password or PIN.", status: 400 };
    }

    const admin = createAdminClient() as AnyClient;
    const emp = await findPortalEmployee(admin, input.identifier);
    if (emp === "ambiguous" || !emp) {
      return { ok: false, error: GENERIC_LOGIN_ERROR, status: 401, code: "invalid" };
    }

    if (!emp.portal_enabled) {
      await logEmployeeAuthEvent(admin, {
        employeeId: emp.id,
        companyId: emp.company_id,
        eventType: "login_fail",
        meta: { reason: "disabled" },
      });
      return { ok: false, error: GENERIC_LOGIN_ERROR, status: 401, code: "disabled" };
    }

    const { data: cred } = await admin
      .from("employee_credentials")
      .select("*")
      .eq("employee_id", emp.id)
      .maybeSingle();

    if (!cred?.password_hash) {
      await logEmployeeAuthEvent(admin, {
        employeeId: emp.id,
        companyId: emp.company_id,
        eventType: "login_fail",
        meta: { reason: "not_configured" },
      });
      return {
        ok: false,
        error: "Portal login is not set up. Ask HR to assign your PIN.",
        status: 403,
        code: "not_configured",
      };
    }

    if (cred.locked_until && new Date(cred.locked_until).getTime() > Date.now()) {
      const retryAfterMs = new Date(cred.locked_until).getTime() - Date.now();
      await logEmployeeAuthEvent(admin, {
        employeeId: emp.id,
        companyId: emp.company_id,
        eventType: "login_lockout",
      });
      return {
        ok: false,
        error: "Too many failed attempts. Try again later or ask HR to reset your PIN.",
        status: 429,
        code: "locked",
        retryAfterMs,
      };
    }

    const valid = verifyPassword(input.password, cred.password_hash);
    if (!valid) {
      const nextFails = (cred.failed_attempts ?? 0) + 1;
      const lockedUntil =
        nextFails >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_MS).toISOString()
          : null;
      await admin
        .from("employee_credentials")
        .update({
          failed_attempts: nextFails,
          locked_until: lockedUntil,
          updated_at: new Date().toISOString(),
        })
        .eq("employee_id", emp.id);

      await logEmployeeAuthEvent(admin, {
        employeeId: emp.id,
        companyId: emp.company_id,
        eventType: lockedUntil ? "login_lockout" : "login_fail",
        meta: { attempts: nextFails },
      });

      if (lockedUntil) {
        return {
          ok: false,
          error: "Too many failed attempts. Try again later or ask HR to reset your PIN.",
          status: 429,
          code: "locked",
          retryAfterMs: LOCKOUT_MS,
        };
      }
      return { ok: false, error: GENERIC_LOGIN_ERROR, status: 401, code: "invalid" };
    }

    await admin
      .from("employee_credentials")
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("employee_id", emp.id);

    const normalizedPhone = String(input.identifier).includes("@")
      ? null
      : normalizeLiberianPhone(input.identifier);
    if (normalizedPhone && emp.phone_e164 !== normalizedPhone) {
      await admin.from("employees").update({ phone_e164: normalizedPhone }).eq("id", emp.id);
    }

    await logEmployeeAuthEvent(admin, {
      employeeId: emp.id,
      companyId: emp.company_id,
      eventType: "login_ok",
    });

    return {
      ok: true,
      employee: {
        employeeId: emp.id,
        companyId: emp.company_id,
        mustChangePassword: Boolean(cred.must_change_password),
      },
    };
  }
}

async function findPortalEmployee(
  admin: AnyClient,
  identifier: string,
): Promise<PortalEmployee | "ambiguous" | null> {
  const raw = String(identifier ?? "").trim();
  if (!raw) return null;
  if (raw.includes("@")) {
    const email = raw.toLowerCase();
    const { data } = await admin
      .from("employees")
      .select("id, company_id, phone_e164, portal_enabled, phone, email, is_active, is_archived")
      .ilike("email", email)
      .eq("is_active", true)
      .eq("is_archived", false);
    return oneOrAmbiguous(data);
  }

  const phoneE164 = normalizeLiberianPhone(raw);
  if (!phoneE164) return null;
  return findPortalEmployeeByPhone(admin, phoneE164);
}

function oneOrAmbiguous(rows: PortalEmployee[] | null | undefined): PortalEmployee | "ambiguous" | null {
  const list = rows ?? [];
  if (list.length > 1) return "ambiguous";
  return list[0] ?? null;
}

export async function findPortalEmployeeByPhone(
  admin: AnyClient,
  phoneE164: string,
): Promise<PortalEmployee | "ambiguous" | null> {
  const { data: byE164 } = await admin
    .from("employees")
    .select("id, company_id, phone_e164, portal_enabled, phone, is_active, is_archived")
    .eq("phone_e164", phoneE164)
    .eq("is_active", true)
    .eq("is_archived", false);

  const exact = (byE164 ?? []) as PortalEmployee[];
  if (exact.length > 0) return oneOrAmbiguous(exact);

  const { data: candidates } = await admin
    .from("employees")
    .select("id, company_id, phone_e164, portal_enabled, phone, is_active, is_archived")
    .eq("is_active", true)
    .eq("is_archived", false);

  const matched = ((candidates ?? []) as Array<PortalEmployee & { phone?: string | null }>).filter((row) => {
    const normalized = normalizeLiberianPhone(row.phone_e164 || row.phone || "");
    return normalized === phoneE164;
  });
  return oneOrAmbiguous(matched);
}
