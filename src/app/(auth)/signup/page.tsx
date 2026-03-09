"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, ArrowRight, CheckCircle2 } from "lucide-react";

export default function SignupPage() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    email: "",
    password: "",
  });

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1000);
  }

  const perks = [
    "First pay run completely free",
    "No credit card required",
    "LRA & NASSCORP compliant from day one",
    "$1.50 per employee/month after trial",
  ];

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
            <p className="text-[#50C878] font-mono text-xs uppercase tracking-widest mb-3">
              Start for free today
            </p>
            <h2 className="text-white text-2xl font-semibold leading-snug mb-6">
              Liberia's smartest payroll platform
            </h2>
            {perks.map((p) => (
              <div key={p} className="flex items-start gap-3 mb-3">
                <CheckCircle2 className="w-4 h-4 text-[#50C878] flex-shrink-0 mt-0.5" />
                <p className="text-white/60 text-sm">{p}</p>
              </div>
            ))}
          </div>
          <p className="text-white/20 text-xs font-mono">
            © {new Date().getFullYear()} Slipdesk · Monrovia, Liberia
          </p>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
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

            <h1 className="text-2xl font-bold text-slate-800 mb-1">Create your account</h1>
            <p className="text-slate-400 text-sm mb-8">
              Set up payroll for your company in minutes
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Company Name
                </label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                  placeholder="Acme Trading Co."
                  required
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl
                             focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                             bg-white text-slate-800 placeholder-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Work Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@company.lr"
                  required
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl
                             focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                             bg-white text-slate-800 placeholder-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
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
                           bg-[#50C878] text-[#002147] font-bold text-sm
                           hover:bg-[#3aa85f] transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-[#002147]/30 border-t-[#002147] rounded-full animate-spin" />
                ) : (
                  <>Create free account <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-4 leading-relaxed">
              By creating an account you agree to our{" "}
              <a href="#" className="text-[#50C878] hover:underline">Terms of Service</a>
              {" "}and{" "}
              <a href="#" className="text-[#50C878] hover:underline">Privacy Policy</a>
            </p>

            <p className="text-center text-sm text-slate-400 mt-5">
              Already have an account?{" "}
              <Link href="/login" className="text-[#50C878] hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}