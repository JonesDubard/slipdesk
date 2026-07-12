import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isDemoModeEnabled } from "@/lib/demo/constants";

/**
 * POST /api/demo/session
 * Returns a short-lived demo session so the browser client can call setSession().
 * Password never leaves the server.
 */
export async function POST() {
  if (!isDemoModeEnabled()) {
    return NextResponse.json({ error: "Demo mode is disabled", code: "DEMO_OFF" }, { status: 403 });
  }

  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!email || !password || !url || !anon) {
    return NextResponse.json(
      { error: "Demo credentials are not configured", code: "DEMO_MISCONFIGURED" },
      { status: 503 },
    );
  }

  // Stateless client — no cookie jar; we hand tokens to the browser.
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.error("[api/demo/session]", error?.message);
    return NextResponse.json(
      { error: error?.message ?? "Could not start demo session", code: "DEMO_AUTH_FAILED" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}
