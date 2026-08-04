"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader, AlertCircle, CheckCircle2, Lock } from "lucide-react";

export default function PortalResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    if (!token) {
      setError("Reset link is missing or invalid.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/employee/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not reset password.");
        return;
      }
      setDone(true);
      setTimeout(() => router.replace("/portal/login"), 1200);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-2xl font-bold text-[#002147]">Slipdesk</p>
          <p className="text-sm text-slate-500 mt-1">Choose a new password</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-[#002147]">
            <Lock className="w-5 h-5" />
            <h1 className="font-semibold">Reset password</h1>
          </div>

          {!token && (
            <div className="flex gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              This reset link is invalid. Request a new one from the forgot-password page.
            </div>
          )}

          {error && (
            <div className="flex gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {done && (
            <div className="flex gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              Password updated. Redirecting to sign in…
            </div>
          )}

          <label className="block text-sm font-medium text-slate-700">
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={loading || !token || !newPassword || !confirm || done}
            className="w-full rounded-xl bg-[#002147] text-white py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader className="w-4 h-4 animate-spin" />}
            Save new password
          </button>
          <p className="text-center text-xs text-slate-400">
            <Link href="/portal/forgot-password" className="text-[#002147] font-medium hover:underline">
              Request a new link
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
