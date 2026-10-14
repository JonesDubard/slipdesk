import { createClient } from "@/lib/supabase/server";
import { bootstrapUserAccount } from "@/lib/auth/bootstrap-server";
import { safeInternalNextPath } from "@/lib/auth/canonical-redirect";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

/**
 * Handles Supabase email-confirmation redirects (PKCE).
 * The confirmation URL is exactly /auth/callback (no ?next=) so it matches
 * the Supabase allow list. next still defaults to /dashboard.
 * Production must allow https://slipdesk.com/auth/callback.
 * Local dev must allow http://localhost:3000/auth/callback.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      let user: User = data.user;
      const refreshed = await supabase.auth.getUser();
      if (refreshed.data.user) user = refreshed.data.user;

      const metadata = (user.user_metadata ?? null) as Record<string, unknown> | null;
      const inviteToken = typeof metadata?.invite_token === "string" ? metadata.invite_token : "";
      const boot = await bootstrapUserAccount(user, {
        inviteToken,
        emailConfirmed: Boolean(user.email_confirmed_at),
      });
      if (!boot.ok) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=invite_setup`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] code exchange failed:", error?.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
