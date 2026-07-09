import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformAdminRole } from "@/lib/auth/platform-admin";

const PROTECTED_PREFIXES = [
  "/dashboard", "/employees", "/payroll", "/analytics", "/compliance",
  "/reports", "/audit", "/team", "/notifications", "/billing", "/settings", "/admin",
];

export async function proxy(request: NextRequest) {
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

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage   = pathname === "/login" || pathname === "/signup";

  if (!user && isProtected) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (user && isProtected) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (isPlatformAdminRole(profile?.role)) {
      return response;
    }

    if (profile?.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("subscription_status, trial_expires_at, billing_bypass")
        .eq("id", profile.company_id)
        .single();

      if (company?.billing_bypass) {
        return response;
      }

      const trialExpiry = company?.trial_expires_at ? new Date(company.trial_expires_at) : null;
      const isTrialValid = company?.subscription_status === "trial" && trialExpiry && trialExpiry > new Date();
      const isActive = company?.subscription_status === "active";

      if (!isTrialValid && !isActive && pathname !== "/billing") {
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
