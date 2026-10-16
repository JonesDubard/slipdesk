/**
 * Follow-up: 0026 migration should add a case-insensitive unique index on
 * (company_id, lower(trim(email))) where email is non-blank.
 * Deferred because this project's DB is hand-migrated.
 */

import { normalizeLiberianPhone } from "@/lib/employee-portal/phone";

export const PORTAL_CONTACT_REQUIRED =
  "Employee needs an email or a Liberian phone number before portal access.";

export const DUPLICATE_EMPLOYEE_EMAIL =
  "Another employee in this company already uses this email.";

export function normalizeEmployeeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

export function employeeEmailCollision(
  email: string | null | undefined,
  rows: readonly { id?: string | null; email?: string | null }[],
  selfId?: string | null,
): boolean {
  const normalized = normalizeEmployeeEmail(email);
  if (!normalized) return false;
  return rows.some((row) => row.id !== selfId && normalizeEmployeeEmail(row.email) === normalized);
}

/** Phone wins when both exist. Email alone is enough. Neither is a hard stop. */
export function portalAssignContact(input: {
  email?: string | null;
  phone?: string | null;
  phoneE164?: string | null;
}): { ok: true; phone: string | null; email: string | null } | { ok: false; error: string } {
  const email = normalizeEmployeeEmail(input.email);
  const phone = normalizeLiberianPhone(input.phoneE164 || input.phone || "");
  if (!phone && !email) return { ok: false, error: PORTAL_CONTACT_REQUIRED };
  return { ok: true, phone, email: email || null };
}

export function portalLoginUrl(appUrl: string | null | undefined): string | null {
  const base = String(appUrl ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  return `${base}/portal/login`;
}

/** WhatsApp deep link for the one-time PIN. Null when the phone or app URL is missing. */
export function whatsAppPinHref(
  phoneE164: string | null | undefined,
  pin: string | null | undefined,
  appUrl: string | null | undefined,
): string | null {
  const phone = normalizeLiberianPhone(phoneE164 ?? "");
  const login = portalLoginUrl(appUrl);
  const secret = String(pin ?? "").trim();
  if (!phone || !login || !secret) return null;
  const text = `Your SlipDesk portal PIN is ${secret}. Log in at ${login}`;
  return `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
}
