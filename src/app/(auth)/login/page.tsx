"use client";

/**
 * Slipdesk — Login Page
 * Paste into: src/app/(auth)/login/page.tsx
 *
 * Super Admin credentials:
 *   Email:    admin@slipdesk.lr
 *   Password: Slipdesk@2026!
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Crown, CheckCircle2 } from "lucide-react";

// ─── Super Admin account ──────────────────────────────────────────────────────
// This is checked client-side for the demo.
// Replace with a real Supabase signInWithPassword() call when going live.

const SUPER_ADMIN = {
  email:    "admin@slipdesk.lr",
  password: "Slipdesk@2026!",
  name:     "Super Admin",
  role:     "super_admin",
  plan:     "premium",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);

  async function handleLogin() {
    setError("");

    if (!email.trim())    { setError("Please enter your email.");    return; }
    if (!password.trim()) { setError("Please enter your password."); return; }

    setLoading(true);

    // Simulate a brief network delay so it feels real
    await new Promise((r) => setTimeout(r, 800));

    // Check against super admin credentials
    if (
      email.trim().toLowerCase() === SUPER_ADMIN.email &&
      password === SUPER_ADMIN.password
    ) {
      // Store session in localStorage so other pages know who's logged in
      localStorage.setItem("slipdesk_user", JSON.stringify({
        email:    SUPER_ADMIN.email,
        name:     SUPER_ADMIN.name,
        role:     SUPER_ADMIN.role,
        plan:     SUPER_ADMIN.plan,
        loggedIn: true,
      }));
      setSuccess(true);
      await new Promise((r) => setTimeout(r, 600));
      router.push("/dashboard");
    } else {
      setError("Incorrect email or password. Try admin@slipdesk.lr / Slipdesk@2025!");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#002147] flex-col justify-between p-12">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Slipdesk</h1>
          <p className="text-white/40 text-sm mt-1 font-mono">Liberian Payroll, Simplified</p>
        </div>
        <div className="space-y-6">
          {[
            { title: "LRA Paye Compliant",          desc: "Automatic tax brackets updated for Liberia" },
            { title: "NASSCORP Built-in",            desc: "4% employee, 6% employer — calculated instantly" },
            { title: "Multi-currency",               desc: "USD and LRD with live exchange rate conversion" },
            { title: "PDF Payslips in One Click",    desc: "Professional payslips for every employee" },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#50C878] mt-2 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">{f.title}</p>
                <p className="text-white/40 text-xs mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-white/20 text-xs font-mono">© {new Date().getFullYear()} Slipdesk · slipdesk.lr</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-slate-50">
        <div className="w-full max-w-md space-y-6">

          {/* Logo (mobile) */}
          <div className="lg:hidden text-center mb-2">
            <h1 className="text-2xl font-bold text-[#002147]">Slipdesk</h1>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-800">Welcome back</h2>
            <p className="text-slate-400 text-sm mt-1">Sign in to your account</p>
          </div>

          {/* Super admin hint card */}
          <div className="bg-[#002147] rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-[#50C878]" />
              <p className="text-sm font-semibold text-white">Super Admin Test Account</p>
              <span className="ml-auto text-[10px] font-mono bg-[#50C878] text-[#002147] px-2 py-0.5 rounded-full font-bold">
                PREMIUM
              </span>
            </div>
            <div className="bg-white/5 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-xs font-mono">Email</span>
                <button
                  onClick={() => setEmail(SUPER_ADMIN.email)}
                  className="text-[#50C878] text-xs font-mono hover:underline"
                >
                  admin@slipdesk.lr
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-xs font-mono">Password</span>
                <button
                  onClick={() => setPassword(SUPER_ADMIN.password)}
                  className="text-[#50C878] text-xs font-mono hover:underline"
                >
                  Slipdesk@2025!
                </button>
              </div>
            </div>
            <p className="text-white/30 text-[10px] font-mono">
              Click the values above to auto-fill the form
            </p>
          </div>

          {/* Form */}
          <div className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="admin@slipdesk.lr"
                className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white
                           focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                           placeholder-slate-300 text-slate-800"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 pr-11 text-sm border border-slate-200 rounded-xl bg-white
                             focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                             placeholder-slate-300 text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <p className="text-sm text-emerald-700 font-medium">Login successful! Redirecting…</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 text-sm font-semibold rounded-xl bg-[#50C878] text-[#002147]
                         hover:bg-[#3aa85f] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && !success ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Signing in…
                </span>
              ) : "Sign In"}
            </button>

            <p className="text-center text-sm text-slate-400">
              Don&apos;t have an account?{" "}
              <a href="/signup" className="text-[#002147] font-semibold hover:underline">
                Sign up
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}