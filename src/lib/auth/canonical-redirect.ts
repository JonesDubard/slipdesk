/**
 * Auth email links must match Supabase Redirect URLs exactly.
 * Localhost stays on the local origin so dev testing still works.
 * Any other host uses NEXT_PUBLIC_APP_URL, then https://slipdesk.com,
 * which is the production Site URL and the e2e LIVE origin.
 * Confirmation uses /auth/callback with no query string.
 */

export const PRODUCTION_APP_ORIGIN = "https://slipdesk.com";

export function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function canonicalAppOrigin(opts: {
  origin: string;
  configuredAppUrl?: string | null;
}): string {
  const origin = opts.origin.trim().replace(/\/$/, "");
  if (isLocalOrigin(origin)) return origin;
  const configured = (opts.configuredAppUrl ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return PRODUCTION_APP_ORIGIN;
}

/** Exact allow-list path. Do not append ?next= or a token. */
export function authCallbackRedirectUrl(opts: {
  origin: string;
  configuredAppUrl?: string | null;
}): string {
  return `${canonicalAppOrigin(opts)}/auth/callback`;
}

export function passwordResetRedirectUrl(opts: {
  origin: string;
  configuredAppUrl?: string | null;
}): string {
  return `${canonicalAppOrigin(opts)}/reset-password`;
}

/** Only these codes are shown. Anything else (including a token) is ignored. */
export function loginErrorMessage(code: string | null | undefined): string | null {
  if (code === "auth_callback") {
    return "Email link expired or invalid. Request a new confirmation or reset link and try again.";
  }
  if (code === "invite_setup") {
    return "We could not attach this account to the inviting organization. Sign in with the invited email, or ask the company owner to resend the invitation.";
  }
  return null;
}

/** Post-login path. Defaults to /dashboard and rejects off-site or token-bearing values. */
export function safeInternalNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || next.includes("?") || next.includes("#")) {
    return "/dashboard";
  }
  return next;
}
