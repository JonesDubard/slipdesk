/**
 * Client portal shell gate. Public auth screens must render with no session check.
 * Any other /api/employee/me result, including a hang, must finish in bounded time.
 */

export const PUBLIC_PORTAL_PATHS = [
  "/portal/login",
  "/portal/forgot-password",
  "/portal/reset-password",
] as const;

export const PORTAL_GATE_TIMEOUT_MS = 8000;

export function normalizePortalPath(pathname: string | null | undefined): string {
  if (!pathname) return "";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function isPublicPortalPath(pathname: string | null | undefined): boolean {
  const path = normalizePortalPath(pathname);
  return (PUBLIC_PORTAL_PATHS as readonly string[]).includes(path);
}

export type PortalGateResult =
  | { action: "skip" }
  | { action: "redirect-login" }
  | { action: "redirect-change-password" }
  | { action: "ready"; employee: unknown }
  | { action: "failed" };

export async function runPortalGate(opts: {
  pathname: string | null;
  isChangePassword: boolean;
  fetchMe: (signal: AbortSignal) => Promise<Response>;
  timeoutMs?: number;
}): Promise<PortalGateResult> {
  if (isPublicPortalPath(opts.pathname)) return { action: "skip" };

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? PORTAL_GATE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("portal session check timed out"));
    }, timeoutMs);
  });

  try {
    const res = await Promise.race([opts.fetchMe(controller.signal), timedOut]);
    if (res.status === 401) return { action: "redirect-login" };
    if (!res.ok) return { action: "failed" };
    const data = await res.json().catch(() => null);
    if (data?.mustChangePassword && !opts.isChangePassword) {
      return { action: "redirect-change-password" };
    }
    return { action: "ready", employee: data?.employee ?? null };
  } catch {
    return { action: "failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
