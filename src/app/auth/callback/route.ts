import { createClient } from "@/lib/supabase/server";
import { bootstrapUserAccount } from "@/lib/auth/bootstrap-server";
import { safeInternalNextPath } from "@/lib/auth/canonical-redirect";
import {
  authCallbackFragmentHtml,
  cookiesFromHeader,
  hasPkceCodeVerifier,
  planAuthCallback,
} from "@/lib/auth/callback-plan";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

/**
 * Confirms a signup email.
 * token_hash + type=signup|email uses verifyOtp and works without the PKCE cookie.
 * ?code= is exchanged only when the verifier cookie from the signup browser is present.
 * #access_token is not visible here; a same-URL document reads the hash.
 * emailRedirectTo stays exactly /auth/callback with no query string.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function finishConfirmedUser(
  supabase: ServerClient,
  user: User,
  origin: string,
  next: string,
) {
  let current = user;
  const refreshed = await supabase.auth.getUser();
  if (refreshed.data.user) current = refreshed.data.user;

  const metadata = (current.user_metadata ?? null) as Record<string, unknown> | null;
  const inviteToken = typeof metadata?.invite_token === "string" ? metadata.invite_token : "";
  const boot = await bootstrapUserAccount(current, {
    inviteToken,
    emailConfirmed: Boolean(current.email_confirmed_at),
  });
  if (!boot.ok) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=invite_setup`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeInternalNextPath(searchParams.get("next"));
  const plan = planAuthCallback({
    code: searchParams.get("code"),
    tokenHash: searchParams.get("token_hash"),
    type: searchParams.get("type"),
    hasCodeVerifier: hasPkceCodeVerifier(cookiesFromHeader(request.headers.get("cookie"))),
  });

  if (plan.action === "client_fragment") {
    return new NextResponse(authCallbackFragmentHtml(), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (plan.action === "fail") {
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }

  const supabase = await createClient();

  if (plan.action === "verify_otp") {
    const { data, error } = await supabase.auth.verifyOtp({
      type: plan.type,
      token_hash: plan.tokenHash,
    });
    const user = data.user ?? null;
    if (!error && user) {
      return finishConfirmedUser(supabase, user, origin, next);
    }
    console.error("[auth/callback] token verification failed:", error?.message);
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(plan.code);
  if (!error && data.user) {
    return finishConfirmedUser(supabase, data.user, origin, next);
  }
  console.error("[auth/callback] code exchange failed:", error?.message);
  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
