import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { INVITE_TTL_MS } from "@/lib/auth/team-invite-policy";

/** Server-only. The raw token is emailed once; only the SHA-256 hash is stored. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function inviteExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + INVITE_TTL_MS).toISOString();
}

export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
