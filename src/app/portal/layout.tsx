"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  FileText, Shield, ClipboardList, Home, LogOut, Loader, Bell, CalendarDays, Clock, MoreHorizontal,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isPublicPortalPath, runPortalGate } from "@/lib/employee-portal/portal-gate";
import type { LinkedEmployee } from "@/lib/employee-portal/session";

const TABS = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/portal/payslips", label: "Payslips", icon: FileText },
  { href: "/portal/leave", label: "Leave", icon: CalendarDays },
  { href: "/portal/attendance", label: "Attendance", icon: Clock },
];

const MORE = [
  { href: "/portal/nasscorp", label: "NASSCORP", icon: Shield },
  { href: "/portal/requests", label: "Requests", icon: ClipboardList },
  { href: "/portal/preferences", label: "Alerts", icon: Bell },
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = isPublicPortalPath(pathname);
  const isChangePassword = pathname === "/portal/change-password";
  const [employee, setEmployee] = useState<LinkedEmployee | null>(null);
  const [loading, setLoading] = useState(!isPublic);
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (isPublic) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const result = await runPortalGate({
        pathname,
        isChangePassword,
        fetchMe: (signal) => fetch("/api/employee/me", { signal }),
      });
      if (cancelled) return;
      if (result.action === "ready") {
        setEmployee((result.employee ?? null) as LinkedEmployee | null);
      }
      setLoading(false);
      if (result.action === "redirect-login") router.replace("/portal/login");
      if (result.action === "redirect-change-password") router.replace("/portal/change-password?first=1");
    })();
    return () => { cancelled = true; };
  }, [isPublic, isChangePassword, router, pathname]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
    } catch {
      // continue
    }
    window.location.assign("/portal/login");
  }

  if (isPublic) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm gap-2">
        <Loader className="w-4 h-4 animate-spin" /> Loading portal…
      </div>
    );
  }

  const moreActive = MORE.some((item) => pathname === item.href);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-[#002147] text-white">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide">Slipdesk</p>
            <p className="text-xs text-white/50">Employee Portal</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium truncate max-w-[160px]">{employee?.fullName}</p>
              <p className="text-xs text-white/40 font-mono">{employee?.employeeNumber}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              aria-label="Sign out"
              className="min-h-11 min-w-11 inline-flex items-center justify-center gap-1.5 text-white/70 hover:text-white text-sm"
            >
              {signingOut ? <Loader className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</main>
      <div className="fixed inset-x-0 bottom-0 z-40">
        {moreOpen && (
          <div className="mx-auto max-w-3xl px-2 pb-1">
            <div className="rounded-xl border border-white/10 bg-[#002147] p-1 shadow-lg">
              {MORE.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-11 items-center gap-2 rounded-lg px-3 py-3 text-sm ${
                      active ? "bg-white/15 text-white" : "text-white/70"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        <nav aria-label="Portal" className="bg-[#002147] pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto grid max-w-3xl grid-cols-5">
            {TABS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 w-full flex-col items-center justify-center gap-0.5 border-t-2 px-0.5 text-xs leading-none ${
                    active ? "border-[#50C878] text-white" : "border-transparent text-white/60"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              aria-label="More"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className={`flex min-h-11 w-full flex-col items-center justify-center gap-0.5 border-t-2 px-0.5 text-xs leading-none ${
                moreActive || moreOpen ? "border-[#50C878] text-white" : "border-transparent text-white/60"
              }`}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span>More</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
