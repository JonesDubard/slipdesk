"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { bootstrapAccount } from "@/lib/auth/bootstrap-client";
import { AUTH_FRAGMENT_STORAGE_KEY, parseAuthFragmentPayload } from "@/lib/auth/callback-plan";

/**
 * Completes an implicit confirmation after /auth/callback reads #access_token.
 * The tokens are not put back on the query string.
 */
export default function AuthCallbackFinishPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(AUTH_FRAGMENT_STORAGE_KEY);
        sessionStorage.removeItem(AUTH_FRAGMENT_STORAGE_KEY);
      } catch {
        raw = null;
      }

      const parsed = parseAuthFragmentPayload(raw);
      if (!parsed) {
        if (!cancelled) router.replace("/login?error=auth_callback");
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      const user = data.user ?? data.session?.user ?? null;
      if (cancelled) return;
      if (error || !user) {
        router.replace("/login?error=auth_callback");
        return;
      }

      const boot = await bootstrapAccount();
      if (cancelled) return;
      if (!boot.ok) {
        await supabase.auth.signOut();
        router.replace("/login?error=invite_setup");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    }

    finish().catch(() => {
      if (!cancelled) router.replace("/login?error=auth_callback");
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <p className="text-sm text-slate-500">Confirming your email…</p>
    </div>
  );
}
