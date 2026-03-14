"use client";

/**
 * Slipdesk — Reset Password Page
 * Place at: src/app/(auth)/reset-password/page.tsx
 *
 * Supabase redirects here after the user clicks the email link.
 * The URL will contain a `code` query param which we exchange for a session,
 * then call updateUser() to set the new password.
 *
 * Next.js App Router note:
 *   Supabase appends ?code=xxx to the redirect URL.
 *   We exchange it via exchangeCodeForSession() before allowing the form.
 */

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Loader, AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PageState = "loading" | "ready" | "saving" | "success" | "invalid";

const RULES = [
  { label: "At least 8 characters",      test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter",        test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number",                  test: (p: string) => /[0-9]/.test(p) },
];

export default function ResetPasswordPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  const [pageState,   setPageState]   = useState<PageState>("loading");
  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error,       setError]       = useState("");

  // ── Exchange the code from the URL for a live session ──────────────────────
  useEffect(() => {
    async function exchangeCode() {
      const code = searchParams.get("code");

      if (!code) {
        // Maybe the user landed here without a valid link
        setPageState("invalid");
        return;
      }

      const { error: err } = await supabase.auth.exchangeCodeForSession(code);
      if (err) {
        console.error("Code exchange error:", err);
        setPageState("invalid");
      } else {
        setPageState("ready");
      }
    }
    exchangeCode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allRulesPassed = RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirm && confirm.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allRulesPassed) { setError("Please satisfy all password requirements."); return; }
    if (!passwordsMatch) { setError("Passwords do not match."); return; }

    setError("");
    setPageState("saving");

    const { error: err } = await supabase.auth.updateUser({ password });

    if (err) {
      setError(err.message);
      setPageState("ready");
    } else {
      setPageState("success");
      // Redirect to dashboard after short delay
      setTimeout(() => router.replace("/dashboard"), 2500);
    }
  }

  // ── Shared chrome ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        * { font-family: 'DM Sans', system-ui, sans-serif; }
        .font-mono { font-family: 'DM Mono', monospace; }
      `}</style>

      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-[#50C878] flex items-center justify-center">
            <Image src="/Slipdesk_Logo_.png" alt="Slipdesk" width={22} height={22}
              className="object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}/>
          </div>
          <span className="text-2xl font-bold text-[#002147]">Slipdesk</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">

          {/* ── Loading — exchanging code ──────────────────────────────────── */}
          {pageState === "loading" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader className="w-6 h-6 animate-spin text-[#50C878]"/>
              <p className="text-sm text-slate-400">Verifying your reset link…</p>
            </div>
          )}

          {/* ── Invalid / expired link ─────────────────────────────────────── */}
          {pageState === "invalid" && (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7 text-red-400"/>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Link expired or invalid</h2>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  This reset link has already been used or has expired.
                  Reset links are valid for 1 hour.
                </p>
              </div>
              <Link href="/forgot-password"
                className="inline-block w-full py-3 rounded-xl text-sm font-bold text-center
                           bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] transition-colors">
                Request a new link
              </Link>
            </div>
          )}

          {/* ── Password form ──────────────────────────────────────────────── */}
          {(pageState === "ready" || pageState === "saving") && (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-800">Set a new password</h1>
                <p className="text-sm text-slate-400 mt-1">
                  Choose a strong password for your Slipdesk account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* New password */}
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300"/>
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(""); }}
                      placeholder="Min. 8 characters"
                      autoFocus
                      className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-200 rounded-xl
                                 focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white
                                 text-slate-800 placeholder-slate-300"/>
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                    </button>
                  </div>

                  {/* Password strength rules */}
                  {password.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {RULES.map((r) => (
                        <li key={r.label}
                          className={`flex items-center gap-1.5 text-xs transition-colors
                            ${r.test(password) ? "text-emerald-600" : "text-slate-400"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                            ${r.test(password) ? "bg-emerald-400" : "bg-slate-300"}`}/>
                          {r.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300"/>
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                      placeholder="Repeat your password"
                      className={`w-full pl-9 pr-10 py-2.5 text-sm border rounded-xl
                                  focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white
                                  text-slate-800 placeholder-slate-300 transition-colors
                                  ${confirm.length > 0
                                    ? passwordsMatch
                                      ? "border-emerald-300"
                                      : "border-red-300"
                                    : "border-slate-200"}`}/>
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      {showConfirm ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                    </button>
                  </div>
                  {confirm.length > 0 && !passwordsMatch && (
                    <p className="text-xs text-red-500 mt-1">Passwords don't match.</p>
                  )}
                </div>

                {/* Error banner */}
                {error && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"/>
                    <p className="text-xs text-red-700">{error}</p>
                  </div>
                )}

                <button type="submit"
                  disabled={pageState === "saving" || !allRulesPassed || !passwordsMatch}
                  className="w-full py-3 rounded-xl text-sm font-bold bg-[#50C878] text-[#002147]
                             hover:bg-[#3aa85f] disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors flex items-center justify-center gap-2">
                  {pageState === "saving"
                    ? <><Loader className="w-4 h-4 animate-spin"/>Updating password…</>
                    : "Set New Password"}
                </button>
              </form>
            </>
          )}

          {/* ── Success ────────────────────────────────────────────────────── */}
          {pageState === "success" && (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-500"/>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Password updated</h2>
                <p className="text-sm text-slate-400 mt-1">
                  You're all set. Redirecting you to your dashboard…
                </p>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <Loader className="w-3.5 h-3.5 animate-spin text-slate-300"/>
                <span className="text-xs text-slate-400 font-mono">redirecting</span>
              </div>
            </div>
          )}

        </div>

        {/* Footer link */}
        {(pageState === "ready" || pageState === "saving") && (
          <div className="text-center mt-5">
            <Link href="/login"
              className="text-sm text-slate-400 hover:text-[#002147] transition-colors">
              Back to sign in
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}