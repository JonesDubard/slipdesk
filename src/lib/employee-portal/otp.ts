/**
 * Reserved OTP helpers for a future funded AuthMethod ("otp").
 * Not used by v0.1.0 — PasswordAuth is the active method (no SMS/WhatsApp).
 * Kept so a future OtpAuth can reuse pure crypto/rate-limit logic without rewrite.
 */

import { createHash, randomInt, timingSafeEqual } from "crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_REQUEST_COOLDOWN_MS = 60 * 1000;
export const OTP_REQUEST_MAX_PER_WINDOW = 3;
export const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;
export const OTP_LOCKOUT_MS = 30 * 60 * 1000;

export type OtpEventType =
  | "request"
  | "request_denied_rate"
  | "request_denied_cooldown"
  | "request_denied_lockout"
  | "request_denied_disabled"
  | "verify_ok"
  | "verify_fail"
  | "verify_lockout";

export function generateOtpCode(length = OTP_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) code += String(randomInt(0, 10));
  return code;
}

export function hashOtp(code: string, phoneE164: string): string {
  return createHash("sha256")
    .update(`${phoneE164}:${code}:slipdesk-employee-otp`)
    .digest("hex");
}

export function verifyOtpHash(code: string, phoneE164: string, expectedHash: string): boolean {
  const actual = hashOtp(code, phoneE164);
  try {
    const a = Buffer.from(actual, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function otpExpiresAt(from = Date.now(), ttlMs = OTP_TTL_MS): Date {
  return new Date(from + ttlMs);
}

export function isOtpExpired(expiresAt: string | Date, now = Date.now()): boolean {
  const t = typeof expiresAt === "string" ? new Date(expiresAt).getTime() : expiresAt.getTime();
  return !Number.isFinite(t) || t <= now;
}

export function isLockedOut(lockedUntil: string | Date | null | undefined, now = Date.now()): boolean {
  if (!lockedUntil) return false;
  const t = typeof lockedUntil === "string" ? new Date(lockedUntil).getTime() : lockedUntil.getTime();
  return Number.isFinite(t) && t > now;
}

/** Stub AuthMethod placeholder — not registered in ACTIVE_AUTH_METHOD for v0.1.0. */
export class OtpAuthUnsupported {
  readonly id = "otp" as const;
  async authenticate(): Promise<{ ok: false; error: string; status: number; code: "unsupported" }> {
    return {
      ok: false,
      error: "OTP auth is not enabled in this release (deferred to a funded messaging track).",
      status: 501,
      code: "unsupported",
    };
  }
}
