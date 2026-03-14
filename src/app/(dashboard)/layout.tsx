"use client";

/**
 * Slipdesk — Dashboard Layout
 * Place at: src/app/(dashboard)/layout.tsx
 *
 * FIX: useApp() was called inside JSX (avatar initials in header) which
 * violated Rules of Hooks and caused the "change in order of Hooks" error.
 * All hook calls are now at the top of each component only.
 */

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, FileText, Settings,
  LogOut, ChevronRight, Bell, Menu, X, CreditCard, Loader,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ToastProvider } from "@/components/Toast";
import ErrorBoundary from "@/components/ErrorBoundary";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users           },
  { href: "/payroll",   label: "Payroll",   icon: FileText        },
  { href: "/billing",   label: "Billing",   icon: CreditCard      },
  { href: "/settings",  label: "Settings",  icon: Settings        },
];

const STYLES = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
    * { font-family: 'DM Sans', system-ui, sans-serif; }
    .font-mono { font-family: 'DM Mono', monospace; }
    :root { --navy:#002147; --emerald:#50C878; --em-dark:#3aa85f; }
    .bg-navy { background-color: var(--navy); }
    .bg-em   { background-color: var(--emerald); }
    .text-em { color: var(--emerald); }
  `}</style>
);

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function SidebarContent({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();

  // ✅ useApp called once at top of component — never inside JSX
  const { employees, company, user, signOut, loading } = useApp();

  const activeCount   = employees.filter((e) => e.isActive).length;
  const companyName   = company.name  || "Your Company";
  const userEmail     = user?.email   || "";
  const displayName   = company.name  || userEmail.split("@")[0] || "User";
  const avatarLetters = initials(displayName) || "?";

  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
          <div className="w-8 h-8 rounded-lg bg-[#50C878] flex items-center justify-center flex-shrink-0">
            <Image
              src="/Slipdesk_Logo_.png"
              alt="Slipdesk"
              width={20}
              height={20}
              className="object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <span className="text-white font-semibold text-base tracking-tight">Slipdesk</span>
        </Link>
      </div>

      {/* Company badge */}
      <div className="px-4 py-3 mx-3 mt-4 rounded-xl bg-white/5 border border-white/10">
        <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-0.5">Company</p>
        {loading ? (
          <div className="h-4 w-32 bg-white/10 rounded animate-pulse mt-1"/>
        ) : (
          <>
            <p className="text-white text-sm font-medium truncate">{companyName}</p>
            <p className="text-white/40 text-xs font-mono">
              {activeCount} active employee{activeCount !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all
                ${active
                  ? "bg-[#50C878] text-[#002147] font-semibold"
                  : "text-white/60 hover:text-white hover:bg-white/8"}`}>
              <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-[#002147]" : ""}`}/>
              {item.label}
              {active && <ChevronRight className="w-3 h-3 ml-auto text-[#002147]/60"/>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 pb-5 space-y-1 border-t border-white/10 pt-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
          <div className="w-8 h-8 rounded-full bg-[#50C878]/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[#50C878] text-xs font-bold">{avatarLetters}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-medium truncate">{displayName}</p>
            <p className="text-white/40 text-xs truncate font-mono">{userEmail}</p>
          </div>
        </div>
        <button onClick={handleSignOut} disabled={signingOut}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/40
                     hover:text-white/70 hover:bg-white/5 transition-all w-full">
          {signingOut ? <Loader className="w-4 h-4 animate-spin"/> : <LogOut className="w-4 h-4"/>}
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Top bar avatar — separate component so hooks stay clean ──────────────────
function TopBarAvatar() {
  // ✅ useApp called once at top of component
  const { company, user } = useApp();
  const displayName = company.name || user?.email?.split("@")[0] || "?";
  const letters     = initials(displayName) || "?";

  return (
    <div className="w-8 h-8 rounded-full bg-[#002147] flex items-center justify-center">
      <span className="text-white text-xs font-bold">{letters}</span>
    </div>
  );
}

// ── Main layout ────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // ✅ useApp called once at top of component
  const { user, loading } = useApp();

  if (loading) {
    return (
      <>
        {STYLES}
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center">
            <Loader className="w-8 h-8 animate-spin text-[#50C878] mx-auto mb-3"/>
            <p className="text-slate-400 text-sm font-mono">Loading Slipdesk…</p>
          </div>
        </div>
      </>
    );
  }

  if (!user) return null;

  return (
    <>
      {STYLES}
      <div className="flex h-screen bg-slate-50 overflow-hidden">

        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col flex-shrink-0 w-60 bg-navy">
          <SidebarContent onClose={() => {}}/>
        </aside>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)}/>
            <aside className="relative w-64 bg-navy h-full z-10">
              <button onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white">
                <X className="w-5 h-5"/>
              </button>
              <SidebarContent onClose={() => setMobileOpen(false)}/>
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="flex-shrink-0 h-14 bg-white border-b border-slate-200
                             flex items-center justify-between px-4 sm:px-6">
            <button className="md:hidden text-slate-500 hover:text-slate-700"
              onClick={() => setMobileOpen(true)}>
              <Menu className="w-5 h-5"/>
            </button>
            <div className="hidden md:block"/>
            <div className="flex items-center gap-3">
              <button className="relative text-slate-400 hover:text-slate-600 transition-colors">
                <Bell className="w-5 h-5"/>
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#50C878] rounded-full"/>
              </button>
              {/* ✅ Avatar in its own component — no inline useApp() in JSX */}
              <TopBarAvatar/>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <ToastProvider>
              <ErrorBoundary label="Dashboard">
                {children}
              </ErrorBoundary>
            </ToastProvider>
          </main>
        </div>
      </div>
    </>
  );
}
