"use client";

/**
 * Slipdesk — Login / Signup Page
 * Place at: src/app/(auth)/login/page.tsx
 *
 * Also create: src/app/(auth)/layout.tsx  (see bottom of file)
 */

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Loader, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bootstrapAccount } from "@/lib/auth/bootstrap-client";

type Mode = "login" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router   = useRouter();
  const searchParams = useSearchParams();
  const supabase =  createClient();

  const [mode,        setMode]        = useState<Mode>("login");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [company,     setCompany]     = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [successMsg,  setSuccessMsg]  = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("error") === "auth_callback") {
      setError("Email link expired or invalid. Request a new confirmation or reset link and try again.");
    }
    const prefill = searchParams.get("email");
    if (prefill) setEmail(prefill);
  }, [searchParams]);

  async function handleSubmit() {
    setError(null);
    setSuccessMsg(null);

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "signup" && !company.trim()) {
      setError("Company name is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    if (mode === "login") {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        const msg = err.message.toLowerCase().includes("invalid login")
          ? "Invalid email or password. If you were invited to a team, create an account at /signup first with that email and a password you choose."
          : err.message;
        setError(msg);
        setLoading(false);
        return;
      }
      const boot = await bootstrapAccount();
      if (!boot.ok) { setError(boot.error ?? "Account setup failed"); setLoading(false); return; }
      router.push("/dashboard");
      router.refresh();
    } else {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { company_name: company.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (err) { setError(err.message); setLoading(false); return; }

      if (data.session) {
        const boot = await bootstrapAccount({ companyName: company.trim() });
        if (!boot.ok) { setError(boot.error ?? "Account setup failed"); setLoading(false); return; }
        router.push("/dashboard");
        router.refresh();
        return;
      }

      setSuccessMsg(
        "Account created! Check your email for a confirmation link, then sign in. " +
        "If you don't receive it within a few minutes, check spam or ask your admin to confirm the address in Supabase.",
      );
      setLoading(false);
      setMode("login");
    }
  }

  const inputClass =
    "w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 " +
    "placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent " +
    "transition-all";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#002147] flex items-center justify-center">
              <Image src="/Slipdesk_Logo_.png" alt="Slipdesk" width={24} height={24}
                className="object-contain" style={{ filter:"brightness(0) invert(1)" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }}/>
            </div>
            <span className="text-2xl font-bold text-[#002147]">Slipdesk</span>
          </div>
          <p className="text-slate-400 text-sm">Liberian payroll, simplified</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {(["login","signup"] as Mode[]).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(null); setSuccessMsg(null); }}
                className={`flex-1 py-4 text-sm font-semibold transition-all
                  ${mode === m
                    ? "text-[#002147] border-b-2 border-[#50C878]"
                    : "text-slate-400 hover:text-slate-600"}`}>
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {/* Form */}
          <div className="p-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Company Name
                </label>
                <input value={company} onChange={(e) => setCompany(e.target.value)}
                  placeholder="Demo Company Ltd." className={inputClass}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}/>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.lr" className={inputClass}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}/>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min. 8 characters" : "••••••••"}
                  className={`${inputClass} pr-11`}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}/>
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  {showPass ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
            </div>

            {/* Forgot password — sign-in mode only */}
            {mode === "login" && (
              <div className="text-right -mt-1">
                <Link href="/forgot-password"
                  className="text-xs text-slate-400 hover:text-[#002147] transition-colors">
                  Forgot password?
                </Link>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"/>
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            {/* Success */}
            {successMsg && (
              <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"/>
                <p className="text-xs text-emerald-700">{successMsg}</p>
              </div>
            )}

            <button onClick={handleSubmit} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold bg-[#50C878] text-[#002147]
                         hover:bg-[#3aa85f] disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors flex items-center justify-center gap-2">
              {loading && <Loader className="w-4 h-4 animate-spin"/>}
              {mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          LRA & NASSCORP compliant payroll for Liberian businesses
        </p>
        <p className="text-center text-xs text-slate-300 mt-2">
          <Link href="/legal" className="hover:text-slate-500 transition-colors">Terms of Service</Link>
          <span className="mx-2">·</span>
          <Link href="/legal" className="hover:text-slate-500 transition-colors">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
