"use client";

/**
 * Slipdesk — Forgot Password Page
 * Place at: src/app/(auth)/forgot-password/page.tsx
 *
 * Sends a password reset email via Supabase.
 * Supabase will email a magic link that redirects to /reset-password.
 *
 * Required in Supabase dashboard:
 *   Authentication → URL Configuration → Redirect URLs
 *   Add: https://yourdomain.com/reset-password
 *   (and http://localhost:3000/reset-password for local dev)
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Mail, Loader, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email,      setEmail]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [submitted,  setSubmitted]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Please enter your email address."); return; }

    setLoading(true);
    setError("");

    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (err) {
      setError(err.message);
    } else {
      setSubmitted(true);
    }
  }

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

          {!submitted ? (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-800">Reset your password</h1>
                <p className="text-sm text-slate-400 mt-1">
                  Enter your account email and we'll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300"/>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(""); }}
                      placeholder="you@company.lr"
                      autoFocus
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl
                                 focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white
                                 text-slate-800 placeholder-slate-300"/>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"/>
                    <p className="text-xs text-red-700">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-bold bg-[#50C878] text-[#002147]
                             hover:bg-[#3aa85f] disabled:opacity-60 disabled:cursor-not-allowed
                             transition-colors flex items-center justify-center gap-2">
                  {loading
                    ? <><Loader className="w-4 h-4 animate-spin"/>Sending…</>
                    : "Send Reset Link"}
                </button>
              </form>
            </>
          ) : (
            // ── Success state ────────────────────────────────────────────────
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-500"/>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Check your inbox</h2>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  We sent a reset link to <span className="font-semibold text-slate-600">{email}</span>.
                  It expires in 1 hour.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-left">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <span className="font-semibold">Don't see it?</span> Check your spam folder.
                  If you still don't receive it, make sure this is the email you signed up with.
                </p>
              </div>
              <button onClick={() => { setSubmitted(false); setEmail(""); }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                Try a different email
              </button>
            </div>
          )}
        </div>

        {/* Back to login */}
        <div className="text-center mt-5">
          <Link href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#002147] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5"/>Back to sign in
          </Link>
        </div>

      </div>
    </div>
  );
}