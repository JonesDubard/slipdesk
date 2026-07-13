import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDemoModeEnabled } from "@/lib/demo/constants";

/**
 * GET /api/demo/enter
 * Signs in the shared demo user, sets auth cookies on the redirect response,
 * then sends the browser to /dashboard (full document navigation — no setSession).
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  if (!isDemoModeEnabled()) {
    return NextResponse.redirect(`${origin}/?demo=off`);
  }

  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
    return NextResponse.redirect(`${origin}/?demo=misconfigured`);
  }

  let response = NextResponse.redirect(`${origin}/dashboard?demo=1`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.redirect(`${origin}/dashboard?demo=1`);
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              path: "/",
              sameSite: "lax",
            });
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("[api/demo/enter]", error.message);
    return NextResponse.redirect(`${origin}/?demo=error`);
  }

  // Hint for edge proxy: skip billing gates on subsequent navigations without DB.
  response.cookies.set("slipdesk_demo", "1", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 8,
  });

  return response;
}
