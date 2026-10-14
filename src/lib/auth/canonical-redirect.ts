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

/**
 * Exact allow-list path. Do not append ?next=, token_hash, or a token.
 * Cross-device confirmation belongs in the Supabase email template:
 * {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=signup
 */
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
    return "Email link expired or invalid. If you opened it on a different device than the one you used to sign up, request a new confirmation email and open that link in this browser.";
  }
  if (code === "invite_setup") {
    return "We could not attach this account to the inviting organization. Sign in with the invited email, or ask the company owner to resend the invitation.";
  }
  return null;
}

/**
 * Password sign-in copy. An unconfirmed email stays distinct from a bad password
 * when Supabase says so (message or code). A plain invalid-credentials error is
 * left as invalid credentials so a wrong password is not described as unconfirmed.
 */
export function passwordSignInErrorMessage(error: {
  message?: string | null;
  code?: string | null;
}): { message: string; emailUnconfirmed: boolean } {
  const message = (error.message ?? "").trim();
  const lower = message.toLowerCase();
  const code = (error.code ?? "").trim().toLowerCase();
  const emailUnconfirmed =
    code === "email_not_confirmed" ||
    lower.includes("email not confirmed") ||
    lower.includes("email_not_confirmed");
  if (emailUnconfirmed) {
    return {
      emailUnconfirmed: true,
      message:
        "Confirm your email from the link we sent before signing in. If you opened that link on another device, request a new confirmation email and open it in this browser.",
    };
  }
  if (lower.includes("invalid login") || code === "invalid_credentials") {
    return {
      emailUnconfirmed: false,
      message:
        "Invalid email or password. If you were invited to a team, create an account at /signup first with that email and a password you choose.",
    };
  }
  return { emailUnconfirmed: false, message: message || "Sign in failed." };
}

/** Post-login path. Defaults to /dashboard and rejects off-site or token-bearing values. */
export function safeInternalNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || next.includes("?") || next.includes("#")) {
    return "/dashboard";
  }
  return next;
}
