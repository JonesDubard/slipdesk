import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformAdminRole } from "@/lib/auth/platform-admin";

const PROTECTED_PREFIXES = [
  "/dashboard", "/employees", "/payroll", "/organization", "/analytics", "/compliance",
  "/reports", "/audit", "/team", "/notifications", "/billing", "/settings", "/admin",
];
// Note: /api/v1/* uses Bearer API keys — intentionally not cookie-protected here.

const AUTH_PAGES = new Set(["/login", "/signup"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Demo cookie handoff — skip session refresh so Set-Cookie from the route wins.
  if (pathname === "/api/demo/enter" || pathname === "/api/demo/session") {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthPage = AUTH_PAGES.has(pathname);

  // Marketing + public API: do NOT call supabase.auth.getUser().
  // Previously every landing-page request paid 200–2000ms for JWT revalidation,
  // which dominated Lighthouse Performance and starved the demo enter flow.
  if (!isProtected && !isAuthPage) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Prefer getSession() in the edge proxy: it reads cookies locally.
  // getUser() revalidates over the network (often 300–2000ms+) and was the
  // dominant TTFB cost on every protected page. Auth Z for data still happens
  // via Supabase RLS + client-side session checks. Trade-off: a revoked JWT
  // may work until expiry for HTML shell access only.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user && isProtected) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Billing / trial gate. Interactive demo sessions skip (query flag or cookie).
  if (
    user &&
    isProtected &&
    pathname !== "/billing" &&
    request.nextUrl.searchParams.get("demo") !== "1" &&
    request.cookies.get("slipdesk_demo")?.value !== "1"
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: profile } = await db
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (isPlatformAdminRole(profile?.role)) {
      return response;
    }

    if (profile?.company_id) {
      const { data: company } = await db
        .from("companies")
        .select("subscription_status, trial_expires_at, billing_bypass, is_demo")
        .eq("id", profile.company_id)
        .single();

      if (company?.billing_bypass || company?.is_demo) {
        return response;
      }

      const trialExpiry = company?.trial_expires_at
        ? new Date(company.trial_expires_at)
        : null;
      const isTrialValid =
        company?.subscription_status === "trial" &&
        trialExpiry &&
        trialExpiry > new Date();
      const isActive = company?.subscription_status === "active";

      if (!isTrialValid && !isActive) {
        return NextResponse.redirect(new URL("/billing", request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
