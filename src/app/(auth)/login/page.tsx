// ============================================================
// LOGIN PAGE — save as: src/app/(auth)/login/page.tsx
// ============================================================
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, ArrowRight, Lock } from "lucide-react";

export default function LoginPage() {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Demo: just redirect after a moment
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 800);
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:opsz,wght@9..40,400;9..40,500&display=swap');
        * { font-family: 'DM Sans', system-ui, sans-serif; }
        .font-mono { font-family: 'DM Mono', monospace; }
      `}</style>
      <div className="min-h-screen bg-slate-50 flex">
        {/* Left panel */}
        <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 bg-[#002147] p-10">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/Slipdesk_Logo_.png"
              alt="Slipdesk"
              width={32}
              height={32}
              className="rounded-md object-contain"
              style={{ background: "white", padding: "2px" }}
            />
            <span className="text-white font-semibold text-base">Slipdesk</span>
          </Link>
          <div>
            <p className="text-white/30 text-xs font-mono uppercase tracking-widest mb-4">
              Why teams trust Slipdesk
            </p>
            {[
              "Automatic LRA PAYE bracket calculation",
              "NASSCORP contributions always correct",
              "USD ↔ LRD dual-currency engine",
              "Offline-resilient — works through internet outages",
            ].map((t) => (
              <div key={t} className="flex items-start gap-3 mb-3">
                <div className="w-5 h-5 rounded-full bg-[#50C878]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#50C878]" />
                </div>
                <p className="text-white/60 text-sm">{t}</p>
              </div>
            ))}
          </div>
          <p className="text-white/20 text-xs font-mono">
            © {new Date().getFullYear()} Slipdesk · Monrovia, Liberia
          </p>
        </div>

        {/* Right panel — form */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            {/* Mobile logo */}
            <Link href="/" className="flex items-center gap-2.5 mb-8 lg:hidden">
              <Image
                src="/Slipdesk_Logo_.png"
                alt="Slipdesk"
                width={28}
                height={28}
                className="rounded object-contain"
                style={{ background: "#002147", padding: "2px" }}
              />
              <span className="text-[#002147] font-semibold">Slipdesk</span>
            </Link>

            <h1 className="text-2xl font-bold text-slate-800 mb-1">Welcome back</h1>
            <p className="text-slate-400 text-sm mb-8">Sign in to your payroll dashboard</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.lr"
                  required
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl
                             focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                             bg-white text-slate-800 placeholder-slate-300"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    Password
                  </label>
                  <a href="#" className="text-xs text-[#50C878] hover:underline">
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl
                               focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                               bg-white text-slate-800 placeholder-slate-300 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                           bg-[#002147] text-white font-semibold text-sm
                           hover:bg-[#002147]/90 transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Sign in <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-slate-400 mt-6">
              Don't have an account?{" "}
              <Link href="/signup" className="text-[#50C878] hover:underline font-medium">
                Create one free
              </Link>
            </p>

            <div className="flex items-center gap-2 mt-8 text-slate-300 justify-center">
              <Lock className="w-3 h-3" />
              <span className="text-xs font-mono">Encrypted</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}