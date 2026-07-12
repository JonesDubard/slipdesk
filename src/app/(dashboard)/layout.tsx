"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, FileText, Settings,
  LogOut, ChevronRight, Bell, Menu, X, CreditCard, Loader,
  BarChart3, ShieldCheck, FileBarChart, ScrollText, UserCog, Network, CalendarDays,
  AlertTriangle, CheckCircle2, Info,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { ToastProvider } from "@/components/Toast";
import ErrorBoundary from "@/components/ErrorBoundary";
import { createClient } from '@/lib/supabase/client';
import type { SubscriptionTier } from "@/context/AppContext";
import { visibleNavItems as filterNavItems, type NavItemDef } from "@/lib/nav";
import { fetchNotifications, markAllNotificationsRead, type AppNotification } from "@/lib/notifications";
import { performSignOut } from "@/lib/sign-out";
import { isPlatformAdminRole } from "@/lib/auth/platform-admin";
import { DemoGuardProvider } from "@/components/demo/DemoGuard";

interface NavItem extends NavItemDef {
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/employees",  label: "Employees",  icon: Users,        permission: "employee:view" },
  { href: "/payroll",    label: "Payroll",    icon: FileText,     permission: "payroll:view" },
  { href: "/payroll/calendar", label: "Calendar", icon: CalendarDays, feature: "payrollCalendar", permission: "payroll:view" },
  { href: "/organization", label: "Organization", icon: Network, feature: "departmentManagement", permission: "company:manage" },
  { href: "/analytics",  label: "Analytics",  icon: BarChart3,    feature: "payrollAnalytics", permission: "analytics:view" },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck,  feature: "complianceDashboard", permission: "compliance:view" },
  { href: "/reports",    label: "Reports",    icon: FileBarChart, permission: "report:view" },
  { href: "/audit",      label: "Audit",      icon: ScrollText,   feature: "auditTrail", permission: "audit:view" },
  { href: "/team",       label: "Team & Roles", icon: UserCog,    feature: "advancedRoles", permission: "users:manage" },
  { href: "/billing",    label: "Billing",    icon: CreditCard,   permission: "billing:manage" },
  { href: "/settings",   label: "Settings",   icon: Settings },
];

function visibleNavItems(
  tier: SubscriptionTier,
  billingBypass: boolean,
  role: import("@/lib/rbac").Role,
): NavItem[] {
  const allowed = filterNavItems(tier, billingBypass, role);
  const allowedHrefs = new Set(allowed.map((i) => i.href));
  return NAV_ITEMS.filter((item) => allowedHrefs.has(item.href));
}

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
  const { employees, company, user, role, signOut, loading } = useApp();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (user?.id) {
      const supabase = createClient();
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .limit(1)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data }: any) => {
          const raw = data?.[0]?.role;
          setIsPlatformAdmin(isPlatformAdminRole(raw));
        });
    }
  }, [user]);

  const navItems = visibleNavItems(company.subscriptionTier, company.billingBypass, role);

  const activeCount    = employees.filter((e) => e.isActive).length;
  const companyName    = company.name || 'Your Company';
  const userEmail      = user?.email || '';
  const displayName    = company.name || userEmail.split('@')[0] || 'User';
  const avatarLetters  = initials(displayName) || '?';

  function handleSignOut() {
    setSigningOut(true);
    void performSignOut(signOut);
  }

  const adminNavItems = isPlatformAdmin ? [
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
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
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

  function handleSignOut() {
    setSigningOut(true);
    void performSignOut(signOut);
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
function bellIcon(sev: string) {
  if (sev === "critical") return <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />;
  if (sev === "warning")  return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />;
  if (sev === "success")  return <CheckCircle2 className="w-4 h-4 text-[#50C878] flex-shrink-0 mt-0.5" />;
  return <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />;
}

function BellButton() {
  const { company } = useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
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

  useEffect(() => {
    if (!company.id) return;
    let cancelled = false;
    fetchNotifications(company.id, 8).then((data) => { if (!cancelled) setItems(data); });
    return () => { cancelled = true; };
  }, [company.id, open]);

  const unread = items.filter((n) => !n.isRead).length;

  async function handleReadAll() {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsRead(company.id);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-[#50C878] text-[#002147] text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl shadow-lg
                        border border-slate-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unread > 0 && (
              <button onClick={handleReadAll} className="text-xs font-semibold text-[#50C878] hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No notifications yet</p>
              <p className="text-xs text-slate-300 mt-1">
                We&apos;ll notify you about payroll, compliance and billing updates
              </p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <div key={n.id} className={`flex gap-2.5 px-4 py-3 border-b border-slate-50 ${n.isRead ? "" : "bg-[#50C878]/5"}`}>
                  {bellIcon(n.severity)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-slate-400 line-clamp-2">{n.body}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-center text-sm font-semibold text-[#002147] hover:bg-slate-50 border-t border-slate-100"
          >
            View all notifications
          </Link>
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
      <DemoGuardProvider>
      <div className="flex flex-1 min-h-0 bg-slate-50">

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
      </DemoGuardProvider>
    </>
  );
}