/**
 * Liberian phone normalization for employee OTP auth.
 * Accepts local (077… / 088…) and E.164 (+231…) forms.
 */

/** Strip to digits only. */
export function digitsOnly(input: string): string {
  return String(input ?? "").replace(/\D/g, "");
}

/**
 * Normalize to E.164 with +231 country code.
 * Returns null when the number cannot be interpreted as a Liberian mobile.
 */
export function normalizeLiberianPhone(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  let digits = digitsOnly(raw);

  // 00231… → 231…
  if (digits.startsWith("00231")) digits = digits.slice(2);
  // Leading 0 on national number: 0775123456 → 775123456
  if (digits.startsWith("0") && digits.length === 10) digits = digits.slice(1);
  // Already has country code without +
  if (digits.startsWith("231") && digits.length >= 11) {
    return `+${digits}`;
  }
  // National mobile: 7/8/5 + 8 digits (9 total after dropping leading 0)
  if (digits.length === 9 && /^[578]/.test(digits)) {
    return `+231${digits}`;
  }
  // Already E.164-ish with + stripped earlier
  if (digits.length === 12 && digits.startsWith("231")) {
    return `+${digits}`;
  }

  // Accept already-normalized +231…
  if (raw.startsWith("+231") && digitsOnly(raw).length >= 11) {
    return `+${digitsOnly(raw)}`;
  }

  return null;
}

/** Synthetic portal email — employees authenticate by phone, not inbox. */
export function employeePortalEmail(employeeId: string): string {
  return `emp_${employeeId.replace(/-/g, "")}@employees.slipdesk.internal`;
}

export function isPortalEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith("@employees.slipdesk.internal"));
}
