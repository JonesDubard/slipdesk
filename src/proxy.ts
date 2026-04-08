import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  const isDashboard  = pathname.startsWith("/dashboard") ||
                       pathname.startsWith("/employees") ||
                       pathname.startsWith("/payroll")   ||
                       pathname.startsWith("/billing")   ||
                       pathname.startsWith("/settings");
  const isAuthPage   = pathname === "/login" || pathname === "/signup";

  if (!user && isDashboard) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Inside your existing proxy function, after getting user
if (user && isDashboard) {
  // Get user's company subscription status
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (profile?.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("subscription_status, trial_expires_at")
      .eq("id", profile.company_id)
      .single();

    const isTrialValid = company?.subscription_status === "trial" && new Date(company.trial_expires_at) > new Date();
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