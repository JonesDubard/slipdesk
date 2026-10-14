/**
 * Decides how /auth/callback should confirm an email.
 * token_hash + type does not need the PKCE verifier, so it works on another device.
 * A ?code= exchange runs only when that verifier cookie is present.
 * Hash fragments (#access_token) never reach the server; the route returns a document
 * that reads them in the browser.
 */

export type SignupOtpType = "signup" | "email";

export type AuthCallbackPlan =
  | { action: "verify_otp"; tokenHash: string; type: SignupOtpType }
  | { action: "exchange_code"; code: string }
  | { action: "client_fragment" }
  | { action: "fail" };

export const AUTH_FRAGMENT_STORAGE_KEY = "slipdesk_auth_fragment";
export const AUTH_FRAGMENT_FINISH_PATH = "/auth/callback/finish";

const OTP_TYPES = new Set<SignupOtpType>(["signup", "email"]);
const MAX_TOKEN_LENGTH = 12000;

export function cookiesFromHeader(header: string | null | undefined): Array<{ name: string; value: string }> {
  if (!header) return [];
  const cookies: Array<{ name: string; value: string }> = [];
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the raw cookie value when it is not URI-encoded.
    }
    cookies.push({ name, value });
  }
  return cookies;
}

/** Supabase SSR stores the PKCE verifier as a cookie whose name ends in code-verifier. */
export function hasPkceCodeVerifier(cookies: Array<{ name: string; value: string }>): boolean {
  return cookies.some((cookie) => {
    if (!cookie.value.trim()) return false;
    return /code-verifier(?:\.\d+)?$/.test(cookie.name);
  });
}

export function planAuthCallback(input: {
  code?: string | null;
  tokenHash?: string | null;
  type?: string | null;
  hasCodeVerifier: boolean;
}): AuthCallbackPlan {
  const tokenHash = input.tokenHash?.trim() ?? "";
  const type = input.type?.trim().toLowerCase() ?? "";
  const code = input.code?.trim() ?? "";
  if (tokenHash && OTP_TYPES.has(type as SignupOtpType)) {
    return { action: "verify_otp", tokenHash, type: type as SignupOtpType };
  }
  if (code && input.hasCodeVerifier) {
    return { action: "exchange_code", code };
  }
  if (!code && !tokenHash) {
    return { action: "client_fragment" };
  }
  return { action: "fail" };
}

export function parseAuthFragmentPayload(raw: string | null | undefined): {
  accessToken: string;
  refreshToken: string;
  type: SignupOtpType;
} | null {
  if (!raw || raw.length > 30000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
  if (!OTP_TYPES.has(type as SignupOtpType)) return null;
  if (!isOpaqueToken(record.access_token) || !isOpaqueToken(record.refresh_token)) return null;
  return {
    accessToken: record.access_token,
    refreshToken: record.refresh_token,
    type: type as SignupOtpType,
  };
}

function isOpaqueToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_TOKEN_LENGTH
    && value.trim() === value
    && !/\s/.test(value);
}

/** Static document. Tokens stay in the URL hash until this script reads them. */
export function authCallbackFragmentHtml(): string {
  const key = JSON.stringify(AUTH_FRAGMENT_STORAGE_KEY);
  const finish = JSON.stringify(AUTH_FRAGMENT_FINISH_PATH);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Confirming email</title>
</head>
<body>
  <p>Confirming your email…</p>
  <p><a href="/login?error=auth_callback">Back to sign in</a></p>
  <script>
    (function () {
      var hash = window.location.hash ? window.location.hash.slice(1) : "";
      var params = new URLSearchParams(hash);
      var accessToken = params.get("access_token") || "";
      var refreshToken = params.get("refresh_token") || "";
      var type = (params.get("type") || "").toLowerCase();
      if ((type !== "signup" && type !== "email") || !accessToken || !refreshToken) {
        window.location.replace("/login?error=auth_callback");
        return;
      }
      try {
        sessionStorage.setItem(${key}, JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          type: type
        }));
      } catch (e) {
        window.location.replace("/login?error=auth_callback");
        return;
      }
      window.location.replace(${finish});
    })();
  </script>
</body>
</html>`;
}
