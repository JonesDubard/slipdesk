"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader, AlertCircle, Lock } from "lucide-react";

export default function PortalLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/employee/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed.");
        return;
      }
      if (data.mustChangePassword) {
        router.replace("/portal/change-password?first=1");
      } else {
        router.replace("/portal");
      }
      router.refresh();
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
            <Lock className="w-5 h-5" />
            <h1 className="font-semibold">Sign in with your PIN</h1>
          </div>
          <p className="text-sm text-slate-500 mb-5">
            Use the mobile number on your employee record and the password or PIN from HR.
          </p>

          {error && (
            <div className="mb-4 flex gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Phone number
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0775123456 or +231775123456"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#50C878]/40"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password / PIN
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="PIN from HR"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#50C878]/40"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void login();
                }}
              />
            </label>
            <button
              onClick={login}
              disabled={loading || !phone.trim() || !password.trim()}
              className="w-full rounded-xl bg-[#002147] text-white py-2.5 text-sm font-semibold hover:bg-[#003066] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
          </div>

          <p className="text-xs text-slate-400 mt-4 space-y-1">
            <Link href="/portal/forgot-password" className="text-[#002147] font-medium hover:underline block">
              Forgot password? Reset by email
            </Link>
            <span className="block">
              No email on file? Ask HR to reset your PIN in person.
            </span>
          </p>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          HR / admin?{" "}
          <Link href="/login" className="text-[#002147] font-medium hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
