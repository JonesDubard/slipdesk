import { createClient } from "@/lib/supabase/server";
import { bootstrapUserAccount } from "@/lib/auth/bootstrap-server";
import { NextResponse } from "next/server";

/**
 * Handles Supabase email-confirmation and password-reset redirects (PKCE).
 * Add http://localhost:3000/auth/callback to Supabase → Auth → URL Configuration.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await bootstrapUserAccount(data.user);
      const safeNext = next.startsWith("/") ? next : "/dashboard";
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error("[auth/callback] code exchange failed:", error?.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
