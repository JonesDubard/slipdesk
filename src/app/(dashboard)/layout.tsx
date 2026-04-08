"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, FileText, Settings,
  LogOut, ChevronRight, Bell, Menu, X, CreditCard, Loader,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { ToastProvider } from "@/components/Toast";
import ErrorBoundary from "@/components/ErrorBoundary";
import { createClient } from '@/lib/supabase/client';

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
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function SidebarContent({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const { employees, company, user, signOut, loading } = useApp();
  const [userRole,   setUserRole]   = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
  if (user?.id) {
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .limit(1)                          // ← take only the first row
      .then(({ data, error }: any) => {
        if (error) {
          console.error('Role fetch error:', error.message);
          setUserRole('member');
        } else {
          setUserRole(data?.[0]?.role || 'member');  // ← data is now an array
        }
      });
  }
}, [user]);

  const activeCount    = employees.filter((e) => e.isActive).length;
  const companyName    = company.name || 'Your Company';
  const userEmail      = user?.email || '';
  const displayName    = company.name || userEmail.split('@')[0] || 'User';
  const avatarLetters  = initials(displayName) || '?';

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      window.location.href = '/login';
    }
  }

  const adminNavItems = userRole === 'admin' ? [
  { href: '/admin/payments', label: 'Admin: Payments', icon: CreditCard },
] : [];

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
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <span className="text-white font-semibold text-base tracking-tight">Slipdesk</span>
        </Link>
      </div>

      {/* Company badge */}
      <div className="px-4 py-3 mx-3 mt-4 rounded-xl bg-white/5 border border-white/10">
        <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-0.5">Company</p>
        {loading ? (
          <div className="h-4 w-32 bg-white/10 rounded animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-white text-sm font-medium truncate">{companyName}</p>
            <p className="text-white/40 text-xs font-mono">
              {activeCount} active employee{activeCount !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all
                ${active
                  ? 'bg-[#50C878] text-[#002147] font-semibold'
                  : 'text-white/60 hover:text-white hover:bg-white/8'}`}
            >
              <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[#002147]' : ''}`} />
              {item.label}
              {active && <ChevronRight className="w-3 h-3 ml-auto text-[#002147]/60" />}
            </Link>
          );
        })}

        {/* Admin section */}
        {adminNavItems.length > 0 && (
          <div className="pt-4 mt-2 border-t border-white/10">
            <p className="px-3 text-[10px] font-mono text-white/30 uppercase tracking-wider mb-2">Admin</p>
            {adminNavItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all
                    ${active
                      ? 'bg-[#50C878] text-[#002147] font-semibold'
                      : 'text-white/60 hover:text-white hover:bg-white/8'}`}
                >
                  <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[#002147]' : ''}`} />
                  {item.label}
                  {active && <ChevronRight className="w-3 h-3 ml-auto text-[#002147]/60" />}
                </Link>
              );
            })}
          </div>
        )}
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
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/40
                     hover:text-white/70 hover:bg-white/5 transition-all w-full"
        >
          {signingOut
            ? <Loader className="w-4 h-4 animate-spin" />
            : <LogOut className="w-4 h-4" />}
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

// ── Top bar avatar dropdown ───────────────────────────────────────────────────
function TopBarAvatar() {
  const { company, user, signOut } = useApp();
  const displayName = company.name || user?.email?.split("@")[0] || "?";
  const userEmail   = user?.email || "";
  const letters     = initials(displayName) || "?";

  const [open,       setOpen]       = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-[#002147] flex items-center justify-center
                   hover:ring-2 hover:ring-[#50C878] transition-all"
      >
        <span className="text-white text-xs font-bold">{letters}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-56 bg-white rounded-2xl shadow-lg
                        border border-slate-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
            <p className="text-xs text-slate-400 font-mono truncate">{userEmail}</p>
          </div>
          <div className="py-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600
                         hover:bg-slate-50 transition-colors"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              Settings
            </Link>
            <Link
              href="/billing"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600
                         hover:bg-slate-50 transition-colors"
            >
              <CreditCard className="w-4 h-4 text-slate-400" />
              Billing
            </Link>
          </div>
          <div className="border-t border-slate-100 py-1">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500
                         hover:bg-red-50 transition-colors w-full disabled:opacity-50"
            >
              {signingOut
                ? <Loader className="w-4 h-4 animate-spin" />
                : <LogOut className="w-4 h-4" />}
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bell button ───────────────────────────────────────────────────────────────
function BellButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#50C878] rounded-full" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-72 bg-white rounded-2xl shadow-lg
                        border border-slate-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
          </div>
          <div className="px-4 py-8 text-center">
            <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No notifications yet</p>
            <p className="text-xs text-slate-300 mt-1">
              We'll notify you about payroll and billing updates
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────
// ── Main layout ───────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading, company } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
      return;
    }
    // Account lock guard — redirect to billing with a lock flag
    // Billing page itself shows the locked UI, so we only block other routes
    if (!loading && user && company.isLocked) {
      const path = window.location.pathname;
      if (path !== "/billing") router.replace("/billing");
    }
  }, [loading, user, company.isLocked, router]);

  if (loading || !user) {
    return (
      <>
        {STYLES}
        <div className="flex h-screen bg-slate-50">
          <aside className="hidden md:flex flex-col flex-shrink-0 w-60 bg-[#002147]" />
          <div className="flex-1 flex flex-col">
            <div className="h-14 bg-white border-b border-slate-200" />
            <div className="flex-1 p-8 space-y-4">
              <div className="h-8 w-48 bg-slate-200 rounded-xl animate-pulse" />
              <div className="h-32 bg-slate-200 rounded-2xl animate-pulse" />
              <div className="h-48 bg-slate-200 rounded-2xl animate-pulse" />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {STYLES}
      {/* Removed overflow-hidden from outer div — it was blocking sidebar clicks */}
      <div className="flex h-screen bg-slate-50">

        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col flex-shrink-0 w-60 bg-navy">
          <SidebarContent onClose={() => {}} />
        </aside>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative w-64 bg-navy h-full z-10">
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              <SidebarContent onClose={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        {/* Main content — overflow goes HERE not on the outer wrapper */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex-shrink-0 h-14 bg-white border-b border-slate-200
                             flex items-center justify-between px-4 sm:px-6">
            <button
              className="md:hidden text-slate-500 hover:text-slate-700"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden md:block" />
            <div className="flex items-center gap-3">
              <BellButton />
              <TopBarAvatar />
            </div>
          </header>

          {/* overflow-y-auto belongs on main, not the outer container */}
          <main className="flex-1 overflow-y-auto">
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