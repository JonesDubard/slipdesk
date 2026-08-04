/**
 * Secure opaque tokens for password reset & payslip access.
 * Plaintext token is returned once; only SHA-256 hash is stored.
 */

import { createHash, randomBytes } from "crypto";

export type SecureTokenPurpose = "password_reset" | "payslip_access" | "email_verify";

export const PAYSLIP_LINK_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(`slipdesk-token:${token}`).digest("hex");
}

export function tokenExpiresAt(ttlMs: number, from = Date.now()): Date {
  return new Date(from + ttlMs);
}

export function isTokenExpired(expiresAt: string | Date, now = Date.now()): boolean {
  const t = typeof expiresAt === "string" ? new Date(expiresAt).getTime() : expiresAt.getTime();
  return !Number.isFinite(t) || t <= now;
}

export type SecureTokenRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  purpose: SecureTokenPurpose;
  tokenHash: string;
  payslipId: string | null;
  expiresAt: string;
  usedAt: string | null;
};

export type TokenValidation =
  | { ok: true; record: SecureTokenRecord }
  | { ok: false; reason: "invalid" | "expired" | "used" };
