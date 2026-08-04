"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader, AlertCircle, CheckCircle2, Mail } from "lucide-react";

/**
 * Forgot password — email path when employee has email on file.
 * Always shows generic success (no enumeration). Employees without email use HR PIN reset.
 */
export default function PortalForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/employee/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send reset email.");
        return;
      }
      setMessage(data.message ?? "If an account exists for that email, a reset link has been sent.");
      setDone(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-2xl font-bold text-[#002147]">Slipdesk</p>
          <p className="text-sm text-slate-500 mt-1">Employee Self-Service Portal</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 text-[#002147]">
            <Mail className="w-5 h-5" />
            <h1 className="font-semibold">Forgot password</h1>
          </div>

          {done ? (
            <div className="space-y-4">
              <div className="flex gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {message}
              </div>
              <p className="text-xs text-slate-500">
                No email on your employee record? Ask HR to reset your PIN in person — that path still works.
              </p>
              <Link href="/portal/login" className="block text-center text-sm font-medium text-[#002147] hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-5">
                Enter the email on your employee record. We will send a secure reset link if a portal account exists.
                Without an email, ask HR to reset your PIN.
              </p>

              {error && (
                <div className="mb-4 flex gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#50C878]/40"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                  }}
                />
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={loading || !email.trim()}
                className="mt-4 w-full rounded-xl bg-[#002147] text-white py-2.5 text-sm font-semibold hover:bg-[#003066] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader className="w-4 h-4 animate-spin" />}
                Send reset link
              </button>
              <p className="text-center text-xs text-slate-400 mt-4">
                <Link href="/portal/login" className="text-[#002147] font-medium hover:underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
