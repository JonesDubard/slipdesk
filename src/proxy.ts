/**
 * Slipdesk — Middleware
 * Place at: src/middleware.ts  (root of src/, not inside app/)
 *
 * - Refreshes Supabase session cookie on every request
 * - Redirects unauthenticated users from /dashboard/* to /login
 * - Redirects authenticated users away from /login to /dashboard
 */

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

  // Refresh session — required for SSR auth
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isDashboard  = pathname.startsWith("/dashboard") ||
                       pathname.startsWith("/employees") ||
                       pathname.startsWith("/payroll")   ||
                       pathname.startsWith("/billing")   ||
                       pathname.startsWith("/settings");
  const isAuthPage   = pathname === "/login" || pathname === "/signup";

  // Unauthenticated → redirect to login
  if (!user && isDashboard) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated → redirect away from auth pages
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};