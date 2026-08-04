/**
 * Password / PIN hashing for employee portal credentials.
 * Uses Node crypto.scrypt — no paid third-party dependency.
 * Format: scrypt$N$r$p$saltB64$hashB64
 */

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_LEN = 16;

const PREFIX = "scrypt";

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(plain, salt, KEYLEN, { N, r: R, p: P });
  return [
    PREFIX,
    String(N),
    String(R),
    String(P),
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== PREFIX) return false;
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], "base64url");
    const expected = Buffer.from(parts[5], "base64url");
    const actual = scryptSync(plain, salt, expected.length, { N: n, r, p });
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Temporary PIN shown once to HR — numeric, easy to relay verbally. */
export function generateTemporaryPin(length = 8): string {
  // Avoid ambiguous leading zeros for verbal relay; still allow 0 elsewhere.
  const digits = "0123456789";
  const bytes = randomBytes(length);
  let pin = "";
  for (let i = 0; i < length; i++) {
    pin += digits[bytes[i]! % 10];
  }
  if (pin[0] === "0") pin = `1${pin.slice(1)}`;
  return pin;
}

export function validatePasswordPolicy(password: string): string | null {
  const p = String(password ?? "");
  if (p.length < 6) return "Password must be at least 6 characters.";
  if (p.length > 128) return "Password is too long.";
  return null;
}

export function isScryptHash(value: string): boolean {
  return value.startsWith(`${PREFIX}$`) && value.split("$").length === 6;
}
