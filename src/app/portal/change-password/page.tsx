"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader, AlertCircle, CheckCircle2 } from "lucide-react";

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-400">Loading…</div>}>
      <ChangePasswordForm />
    </Suspense>
  );
}

function ChangePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const firstLogin = searchParams.get("first") === "1";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/employee/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not update password.");
        return;
      }
      setDone(true);
      setTimeout(() => router.replace("/portal"), 800);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#002147]">
          {firstLogin ? "Set your password" : "Change password"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {firstLogin
            ? "Enter the temporary PIN from HR, then choose a new password you will use going forward."
            : "Choose a new password for the employee portal."}
        </p>
      </div>

      {error && (
        <div className="flex gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {done && (
        <div className="flex gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          Password updated. Redirecting…
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          {firstLogin ? "Temporary PIN from HR" : "Current password"}
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          />
        </label>
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
          Confirm new password
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
          disabled={loading || !currentPassword || !newPassword || !confirm}
          className="w-full rounded-xl bg-[#002147] text-white py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader className="w-4 h-4 animate-spin" />}
          Save password
        </button>
      </div>
    </div>
  );
}
