import { createHash, randomBytes } from "crypto";

export function generateApiKeyPlaintext(): { plaintext: string; prefix: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  const plaintext = `sk_live_${raw}`;
  const prefix = plaintext.slice(0, 12);
  return { plaintext, prefix, hash: hashApiKey(plaintext) };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}
