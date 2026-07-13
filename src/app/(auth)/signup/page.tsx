"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, ArrowRight, CheckCircle2, AlertCircle, Loader } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bootstrapAccount } from "@/lib/auth/bootstrap-client";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const invited = searchParams.get("invite") === "1";
  const invitedEmail = (searchParams.get("email") ?? "").trim().toLowerCase();

  const [show,    setShow]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form,    setForm]    = useState({
    email:       invitedEmail,
    password:    "",
  });

  useEffect(() => {
    if (invitedEmail) {
      setForm((prev) => ({ ...prev, email: invitedEmail }));
    }
  }, [invitedEmail]);

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invited) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    const email = form.email.trim().toLowerCase();
    if (invitedEmail && email !== invitedEmail) {
      setError(`Use the invited email address (${invitedEmail}) to join your team.`);
      setLoading(false);
      return;
    }

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: {},
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (signUpErr) {
      const msg = signUpErr.message.toLowerCase().includes("already")
        ? "An account with this email already exists. Sign in with your password instead."
        : signUpErr.message;
      setError(msg);
      setLoading(false);
      return;
    }

    if (data.session) {
      const boot = await bootstrapAccount({});
      if (!boot.ok) {
        setError(boot.error ?? "Account created but setup failed. Try signing in.");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setSuccess(
      "Account created! Check your email for a confirmation link, then sign in. " +
        "Use the same email and the password you just chose — invites do not include a password.",
    );
    setLoading(false);
  }

  const perks = [
    "LRA & NASSCORP compliant from day one",
    "Dual-currency USD & LRD payroll",
    "PDF payslips in one click",
    "Plans from $50/month",
  ];

  const inputClass =
    "w-full px-4 py-3 text-sm border border-slate-200 rounded-xl " +
    "focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent " +
    "bg-white text-slate-800 placeholder-slate-300";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:opsz,wght@9..40,400;9..40,500&display=swap');
        * { font-family: 'DM Sans', system-ui, sans-serif; }
        .font-mono { font-family: 'DM Mono', monospace; }
      `}</style>

      <div className="min-h-screen bg-slate-50 flex">
        <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 bg-[#002147] p-10">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/Slipdesk_Logo_.png" alt="Slipdesk" width={32} height={32}
              className="rounded-md object-contain" style={{ background: "white", padding: "2px" }} />
            <span className="text-white font-semibold text-base">Slipdesk</span>
          </Link>
          <div>
            <p className="text-[#50C878] font-mono text-xs uppercase tracking-widest mb-3">Built for Liberian SMEs</p>
            <h2 className="text-white text-2xl font-semibold leading-snug mb-6">Liberia&apos;s smartest payroll platform</h2>
            {perks.map((p) => (
              <div key={p} className="flex items-start gap-3 mb-3">
                <CheckCircle2 className="w-4 h-4 text-[#50C878] flex-shrink-0 mt-0.5" />
                <p className="text-white/60 text-sm">{p}</p>
              </div>
            ))}
          </div>
          <p className="text-white/20 text-xs font-mono">© {new Date().getFullYear()} Slipdesk · Monrovia, Liberia</p>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <Link href="/" className="flex items-center gap-2.5 mb-8 lg:hidden">
              <Image src="/Slipdesk_Logo_.png" alt="Slipdesk" width={28} height={28}
                className="rounded object-contain" style={{ background: "#002147", padding: "2px" }} />
              <span className="text-[#002147] font-semibold">Slipdesk</span>
            </Link>

            {!invited ? (
              <>
                <h1 className="text-2xl font-bold text-slate-800 mb-1">Invite-only access</h1>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                  Access is invite-only. If you are a customer, please{" "}
                  <Link href="/login" className="text-[#50C878] hover:underline font-medium">sign in</Link>.
                  {" "}For demos, explore our{" "}
                  <Link href="/api/demo/enter" className="text-[#50C878] hover:underline font-medium">interactive demo</Link>.
                </p>
                <div className="space-y-3">
                  <Link
                    href="/api/demo/enter"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#50C878] text-[#002147] font-bold text-sm hover:bg-[#3aa85f] transition-colors"
                  >
                    Explore Interactive Demo <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/login"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
                  >
                    Customer sign in
                  </Link>
                  <a
                    href={process.env.NEXT_PUBLIC_BOOK_DEMO_URL || "/#contact"}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[#50C878] font-semibold text-sm hover:underline"
                  >
                    Book a Live Demo
                  </a>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-slate-800 mb-1">Join your team</h1>
                <p className="text-slate-400 text-sm mb-8">
                  Create your Slipdesk login with the invited email and a password you choose.
                </p>

                {error && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">{error}</p>
                  </div>
                )}
                {success && (
                  <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-700">{success}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">Work Email</label>
                    <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                      placeholder="you@company.lr" required readOnly={!!invitedEmail}
                      className={`${inputClass}${invitedEmail ? " bg-slate-50" : ""}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
                    <div className="relative">
                      <input type={show ? "text" : "password"} value={form.password}
                        onChange={(e) => set("password", e.target.value)}
                        placeholder="Min. 8 characters" required minLength={8}
                        className={`${inputClass} pr-10`} />
                      <button type="button" onClick={() => setShow(!show)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#50C878] text-[#002147] font-bold text-sm hover:bg-[#3aa85f] transition-colors disabled:opacity-60">
                    {loading ? <Loader className="w-4 h-4 animate-spin" /> : <>Join team <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>

                <p className="text-center text-sm text-slate-400 mt-5">
                  Already have an account?{" "}
                  <Link
                    href={invitedEmail ? `/login?email=${encodeURIComponent(invitedEmail)}` : "/login"}
                    className="text-[#50C878] hover:underline font-medium"
                  >
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <SignupForm />
    </Suspense>
  );
}
