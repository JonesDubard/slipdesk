import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDemoModeEnabled } from "@/lib/demo/constants";

/**
 * GET /demo/enter — sign in as the shared demo user and redirect to /dashboard.
 */
export async function GET(request: NextRequest) {
  if (!isDemoModeEnabled()) {
    return NextResponse.redirect(new URL("/?demo=off", request.url));
  }

  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
    return NextResponse.redirect(new URL("/?demo=misconfigured", request.url));
  }

  let response = NextResponse.redirect(new URL("/dashboard?demo=1", request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(new URL("/dashboard?demo=1", request.url));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("[demo/enter]", error.message);
    return NextResponse.redirect(new URL("/?demo=error", request.url));
  }

  return response;
}
