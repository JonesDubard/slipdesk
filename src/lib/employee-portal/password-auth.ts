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

export class PasswordAuth implements AuthMethod {
  readonly id = "password" as const;

  async authenticate(input: AuthInput): Promise<AuthResult> {
    assertPasswordInput(input);

    const phoneE164 = normalizeLiberianPhone(input.identifier);
    if (!phoneE164) {
      return { ok: false, error: "Enter a valid Liberian phone number.", status: 400 };
    }
    if (!String(input.password ?? "").trim()) {
      return { ok: false, error: "Enter your password or PIN.", status: 400 };
    }

    const admin = createAdminClient() as AnyClient;

    const emp = await findPortalEmployeeByPhone(admin, phoneE164);
    if (!emp) {
      // Generic failure — no enumeration
      return { ok: false, error: "Invalid phone or password.", status: 401, code: "invalid" };
    }

    if (!emp.portal_enabled) {
      await logEmployeeAuthEvent(admin, {
        employeeId: emp.id,
        companyId: emp.company_id,
        eventType: "login_fail",
        meta: { reason: "disabled" },
      });
      return { ok: false, error: "Invalid phone or password.", status: 401, code: "disabled" };
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
      return { ok: false, error: "Invalid phone or password.", status: 401, code: "invalid" };
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

    // Persist normalized phone for future logins
    if (emp.phone_e164 !== phoneE164) {
      await admin.from("employees").update({ phone_e164: phoneE164 }).eq("id", emp.id);
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

export async function findPortalEmployeeByPhone(
  admin: AnyClient,
  phoneE164: string,
): Promise<{
  id: string;
  company_id: string;
  phone_e164: string | null;
  portal_enabled: boolean;
} | null> {
  const { data: byE164 } = await admin
    .from("employees")
    .select("id, company_id, phone_e164, portal_enabled, phone, is_active, is_archived")
    .eq("phone_e164", phoneE164)
    .eq("is_active", true)
    .eq("is_archived", false)
    .limit(1)
    .maybeSingle();

  if (byE164) return byE164;

  const { data: candidates } = await admin
    .from("employees")
    .select("id, company_id, phone_e164, portal_enabled, phone, is_active, is_archived")
    .eq("is_active", true)
    .eq("is_archived", false)
    .limit(500);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = ((candidates ?? []) as any[]).find((row) => {
    const normalized = normalizeLiberianPhone(row.phone_e164 || row.phone || "");
    return normalized === phoneE164;
  });
  return match ?? null;
}
