/**
 * Employee portal auth orchestration — password/PIN only in v0.1.0.
 * Session cookies use existing Supabase Auth (already in stack; no paid SMS).
 *
 * OTP request/verify paths are intentionally removed from the active surface.
 * AuthMethod abstraction allows a future OtpAuth without restructuring callers.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_AUTH_METHOD, type AuthFailure } from "@/lib/employee-portal/auth-method";
import { PasswordAuth } from "@/lib/employee-portal/password-auth";
import {
  generateTemporaryPin,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "@/lib/employee-portal/password";
import { employeePortalEmail, normalizeLiberianPhone } from "@/lib/employee-portal/phone";
import { findAuthUserByEmail } from "@/lib/employee-portal/find-auth-user";
import { logEmployeeAuthEvent } from "@/lib/employee-portal/auth-events";
import { logAuditServer } from "@/lib/audit-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const passwordAuth = new PasswordAuth();

export function getActiveAuthMethod() {
  if (ACTIVE_AUTH_METHOD === "password") return passwordAuth;
  // Future: return new OtpAuth()
  throw new Error(`Auth method ${ACTIVE_AUTH_METHOD} is not available in this release.`);
}

export async function loginWithPassword(
  identifier: string,
  password: string,
): Promise<
  | {
      ok: true;
      employeeId: string;
      companyId: string;
      mustChangePassword: boolean;
      userId: string;
      email: string;
      tokenHash: string;
    }
  | AuthFailure
> {
  const result = await getActiveAuthMethod().authenticate({
    method: "password",
    identifier,
    password,
  });
  if (!result.ok) return result;

  const session = await ensureEmployeeAuthUser(
    createAdminClient() as AnyClient,
    result.employee.employeeId,
    result.employee.companyId,
  );
  if (!session.ok) return session;

  return {
    ok: true,
    employeeId: result.employee.employeeId,
    companyId: result.employee.companyId,
    mustChangePassword: result.employee.mustChangePassword,
    userId: session.userId,
    email: session.email,
    tokenHash: session.tokenHash,
  };
}

/**
 * Employee sets a new password (first login or voluntary change).
 * Requires knowing the current password unless forceFirstChange with session.
 */
export async function changeEmployeePassword(opts: {
  employeeId: string;
  currentPassword?: string;
  newPassword: string;
  /** When true, skip current-password check (must_change_password flow). */
  allowWithoutCurrent?: boolean;
  actorUserId?: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const policy = validatePasswordPolicy(opts.newPassword);
  if (policy) return { ok: false, error: policy, status: 400 };

  const admin = createAdminClient() as AnyClient;
  const { data: cred } = await admin
    .from("employee_credentials")
    .select("*")
    .eq("employee_id", opts.employeeId)
    .maybeSingle();

  if (!cred) {
    return { ok: false, error: "Credentials not found.", status: 404 };
  }

  const mustChange = Boolean(cred.must_change_password);
  if (!opts.allowWithoutCurrent && !mustChange) {
    if (!opts.currentPassword || !verifyPassword(opts.currentPassword, cred.password_hash)) {
      return { ok: false, error: "Current password is incorrect.", status: 401 };
    }
  } else if (mustChange && opts.currentPassword) {
    // First-login change: still verify the temporary PIN HR gave them
    if (!verifyPassword(opts.currentPassword, cred.password_hash)) {
      return { ok: false, error: "Temporary PIN is incorrect.", status: 401 };
    }
  } else if (mustChange && !opts.currentPassword && !opts.allowWithoutCurrent) {
    return { ok: false, error: "Enter your temporary PIN to set a new password.", status: 400 };
  }

  const passwordHash = hashPassword(opts.newPassword);
  await admin
    .from("employee_credentials")
    .update({
      password_hash: passwordHash,
      must_change_password: false,
      failed_attempts: 0,
      locked_until: null,
      password_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", opts.employeeId);

  await logEmployeeAuthEvent(admin, {
    employeeId: opts.employeeId,
    companyId: cred.company_id,
    eventType: "password_changed",
    actorId: opts.actorUserId ?? null,
  });

  return { ok: true };
}

/**
 * HR assigns or resets portal credentials.
 * Returns the temporary password ONCE in the response — never logged or stored plaintext.
 */
export async function assignOrResetPortalPassword(opts: {
  employeeId: string;
  companyId: string;
  actorUserId: string;
  actorEmail?: string | null;
  mode: "assign" | "reset";
  /** Optional HR-chosen temp PIN; otherwise generated. */
  temporaryPassword?: string;
}): Promise<
  | { ok: true; temporaryPassword: string; phone: string; employeeName: string }
  | { ok: false; error: string; status: number }
> {
  const admin = createAdminClient() as AnyClient;

  const { data: emp, error } = await admin
    .from("employees")
    .select("id, company_id, full_name, phone, phone_e164, portal_enabled, is_active, is_archived")
    .eq("id", opts.employeeId)
    .eq("company_id", opts.companyId)
    .maybeSingle();

  if (error || !emp) {
    return { ok: false, error: "Employee not found.", status: 404 };
  }
  if (!emp.is_active || emp.is_archived) {
    return { ok: false, error: "Employee must be active.", status: 400 };
  }

  const phoneNorm = normalizeLiberianPhone(emp.phone_e164 || emp.phone || "");
  if (!phoneNorm) {
    return {
      ok: false,
      error: "Employee needs a valid Liberian phone number before portal access.",
      status: 400,
    };
  }

  const temporaryPassword = opts.temporaryPassword?.trim() || generateTemporaryPin(8);
  const policy = validatePasswordPolicy(temporaryPassword);
  if (policy) return { ok: false, error: policy, status: 400 };

  const passwordHash = hashPassword(temporaryPassword);

  await admin
    .from("employees")
    .update({ portal_enabled: true, phone_e164: phoneNorm })
    .eq("id", emp.id);

  const { data: existing } = await admin
    .from("employee_credentials")
    .select("employee_id")
    .eq("employee_id", emp.id)
    .maybeSingle();

  if (existing) {
    await admin
      .from("employee_credentials")
      .update({
        password_hash: passwordHash,
        must_change_password: true,
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("employee_id", emp.id);
  } else {
    await admin.from("employee_credentials").insert({
      employee_id: emp.id,
      company_id: emp.company_id,
      password_hash: passwordHash,
      must_change_password: true,
    });
  }

  // Ensure auth user exists so first login can establish a session quickly
  await ensureEmployeeAuthUser(admin, emp.id, emp.company_id);

  const eventType = opts.mode === "reset" ? "password_reset" : "password_assigned";
  await logEmployeeAuthEvent(admin, {
    employeeId: emp.id,
    companyId: emp.company_id,
    eventType,
    actorId: opts.actorUserId,
    meta: { mode: opts.mode },
  });

  await logAuditServer(admin, {
    companyId: emp.company_id,
    action: opts.mode === "reset" ? "employee.portal_password_reset" : "employee.portal_password_assign",
    entityType: "employee",
    entityId: emp.id,
    actorId: opts.actorUserId,
    actorEmail: opts.actorEmail ?? null,
    // Never include the temporary password in the audit trail
    newValue: { portal_enabled: true, must_change_password: true },
  });

  // Return plaintext only to the calling admin response — not stored, not audited.
  return {
    ok: true,
    temporaryPassword,
    phone: phoneNorm,
    employeeName: emp.full_name,
  };
}

export async function disablePortalAccess(opts: {
  employeeId: string;
  companyId: string;
  actorUserId: string;
  actorEmail?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const admin = createAdminClient() as AnyClient;
  const { data: emp } = await admin
    .from("employees")
    .select("id, company_id")
    .eq("id", opts.employeeId)
    .eq("company_id", opts.companyId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "Employee not found.", status: 404 };

  await admin.from("employees").update({ portal_enabled: false }).eq("id", emp.id);
  await admin.from("employee_credentials").delete().eq("employee_id", emp.id);

  await logEmployeeAuthEvent(admin, {
    employeeId: emp.id,
    companyId: emp.company_id,
    eventType: "portal_disabled",
    actorId: opts.actorUserId,
  });

  await logAuditServer(admin, {
    companyId: emp.company_id,
    action: "employee.portal_disabled",
    entityType: "employee",
    entityId: emp.id,
    actorId: opts.actorUserId,
    actorEmail: opts.actorEmail ?? null,
  });

  return { ok: true };
}

async function ensureEmployeeAuthUser(
  admin: AnyClient,
  employeeId: string,
  companyId: string,
): Promise<
  | { ok: true; userId: string; email: string; tokenHash: string }
  | { ok: false; error: string; status: number }
> {
  const email = employeePortalEmail(employeeId);

  const { data: emp } = await admin
    .from("employees")
    .select("id, user_id, company_id, portal_enabled")
    .eq("id", employeeId)
    .maybeSingle();

  if (!emp) return { ok: false, error: "Employee not found.", status: 404 };

  let userId: string | null = emp.user_id ?? null;

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        employee_id: employeeId,
        company_id: companyId,
        portal: "employee",
      },
    });
    if (createErr || !created?.user) {
      const existing = await findAuthUserByEmail(email);
      if (!existing) {
        console.warn("[employee-auth] createUser failed:", createErr?.message);
        return { ok: false, error: "Could not create portal session.", status: 500 };
      }
      userId = existing.id;
    } else {
      userId = created.user.id;
    }
    await admin.from("employees").update({ user_id: userId }).eq("id", employeeId);
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existingProfile) {
    await admin
      .from("profiles")
      .update({ email, role: "employee", company_id: companyId })
      .eq("id", userId);
  } else {
    await admin.from("profiles").insert({
      id: userId,
      email,
      role: "employee",
      company_id: companyId,
      company_name: "Employee Portal",
    });
  }

  const { data: existingMember } = await admin
    .from("company_members")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingMember) {
    await admin.from("company_members").insert({
      company_id: companyId,
      user_id: userId,
      role: "employee",
      status: "active",
      invited_email: email,
    });
  } else {
    await admin
      .from("company_members")
      .update({ role: "employee", status: "active" })
      .eq("id", existingMember.id);
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    console.warn("[employee-auth] generateLink failed:", linkErr?.message);
    return { ok: false, error: "Could not establish session.", status: 500 };
  }

  return { ok: true, userId: userId!, email, tokenHash };
}

export async function getCredentialStatus(
  employeeId: string,
): Promise<{ mustChangePassword: boolean; hasCredentials: boolean } | null> {
  const admin = createAdminClient() as AnyClient;
  const { data } = await admin
    .from("employee_credentials")
    .select("must_change_password")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!data) return { mustChangePassword: false, hasCredentials: false };
  return {
    mustChangePassword: Boolean(data.must_change_password),
    hasCredentials: true,
  };
}
