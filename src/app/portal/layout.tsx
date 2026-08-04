"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  FileText, Shield, ClipboardList, Home, LogOut, Loader, Menu, X, Bell, CalendarDays, Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { LinkedEmployee } from "@/lib/employee-portal/session";

const NAV = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/portal/payslips", label: "Payslips", icon: FileText },
  { href: "/portal/leave", label: "Leave", icon: CalendarDays },
  { href: "/portal/attendance", label: "Attendance", icon: Clock },
  { href: "/portal/nasscorp", label: "NASSCORP", icon: Shield },
  { href: "/portal/requests", label: "Requests", icon: ClipboardList },
  { href: "/portal/preferences", label: "Alerts", icon: Bell },
];

const PUBLIC_PATHS = new Set([
  "/portal/login",
  "/portal/forgot-password",
  "/portal/reset-password",
]);

export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.has(pathname);
  const isChangePassword = pathname === "/portal/change-password";
  const [employee, setEmployee] = useState<LinkedEmployee | null>(null);
  const [loading, setLoading] = useState(!isPublic);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (isPublic) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/employee/me");
      if (cancelled) return;
      if (res.status === 401 || res.status === 403) {
        router.replace("/portal/login");
        return;
      }
      const data = await res.json();
      if (data.mustChangePassword && !isChangePassword) {
        router.replace("/portal/change-password?first=1");
        return;
      }
      setEmployee(data.employee ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isPublic, isChangePassword, router, pathname]);

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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-[#002147] text-white">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="sm:hidden text-white/70"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div>
              <p className="text-sm font-semibold tracking-wide">Slipdesk</p>
              <p className="text-[11px] text-white/50">Employee Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium truncate max-w-[160px]">{employee?.fullName}</p>
              <p className="text-[11px] text-white/40 font-mono">{employee?.employeeNumber}</p>
            </div>
            <button
              onClick={signOut}
              disabled={signingOut}
              className="text-white/50 hover:text-white text-sm flex items-center gap-1.5"
            >
              {signingOut ? <Loader className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <nav className={`max-w-3xl mx-auto px-2 pb-2 ${mobileOpen ? "block" : "hidden"} sm:block`}>
          <div className="flex flex-col sm:flex-row gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active ? "bg-white/15 text-white" : "text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
