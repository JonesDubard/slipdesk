/**
 * Which requests the Next.js proxy must create a Supabase SSR client for.
 *
 * Cookie-authenticated `/api/*` routes used to skip this, so expired access
 * tokens were never refreshed onto the request. Route Handlers then called
 * `getUser()` (network revalidation, autoRefreshToken: false) and returned 401
 * while the HTML shell still looked signed-in via unverified `getSession()`.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/employees",
  "/payroll",
  "/organization",
  "/analytics",
  "/compliance",
  "/reports",
  "/audit",
  "/team",
  "/notifications",
  "/billing",
  "/settings",
  "/admin",
  "/hr",
] as const;

const AUTH_PAGES = new Set(["/login", "/signup", "/portal/login"]);

export function isEmployeePortalPath(pathname: string): boolean {
  return pathname === "/portal" || (pathname.startsWith("/portal/") && pathname !== "/portal/login");
}

export function isProtectedAppPath(pathname: string): boolean {
  return (
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    isEmployeePortalPath(pathname)
  );
}

export function isAuthPagePath(pathname: string): boolean {
  return AUTH_PAGES.has(pathname);
}

/**
 * Cookie-session APIs. Bearer (`/api/v1`), demo handoff, cron, and public
 * webhooks must not run JWT refresh — they either use a different credential
 * or must not touch auth cookies.
 */
export function isCookieAuthApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (pathname === "/api/v1" || pathname.startsWith("/api/v1/")) return false;
  if (pathname === "/api/demo/enter" || pathname === "/api/demo/session") return false;
  if (pathname === "/api/cron" || pathname.startsWith("/api/cron/")) return false;
  if (pathname.startsWith("/api/payments/momo-webhook")) return false;
  if (pathname === "/api/faqs") return false;
  return true;
}

export function shouldCreateSupabaseInProxy(pathname: string): boolean {
  return isProtectedAppPath(pathname) || isAuthPagePath(pathname) || isCookieAuthApiPath(pathname);
}
