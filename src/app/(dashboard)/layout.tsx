"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  ChevronRight,
  Bell,
  Menu,
  X,
  CreditCard,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "@/context/AppContext";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users           },
  { href: "/payroll",   label: "Payroll",   icon: FileText        },
  { href: "/billing",   label: "Billing",   icon: CreditCard      },
  { href: "/settings",  label: "Settings",  icon: Settings        },
];

const STYLES = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:opsz,wght@9..40,400;9..40,500&display=swap');
    :root {
      --navy:   #002147;
      --emerald:#50C878;
      --em-dark:#3aa85f;
      --sidebar-w: 240px;
    }
    * { font-family: 'DM Sans', system-ui, sans-serif; }
    .font-mono { font-family: 'DM Mono', monospace; }
    .bg-navy   { background-color: var(--navy); }
    .text-em   { color: var(--emerald); }
    .bg-em     { background-color: var(--emerald); }
    .hover-em:hover { background-color: var(--em-dark); }
  `}</style>
);

// ── Pulled OUT of DashboardLayout so hooks work correctly ──────────────────────
function SidebarContent({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const { employees, companyName } = useApp();
  const activeCount = employees.filter((e) => e.isActive).length;

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          onClick={onClose}
        >
          <Image
            src="/Slipdesk_Logo_.png"
            alt="Slipdesk"
            width={30}
            height={30}
            className="rounded object-contain"
            style={{ background: "white", padding: "2px" }}
          />
          <span className="text-white font-semibold text-base">Slipdesk</span>
        </Link>
      </div>

      {/* Company badge — now dynamic */}
      <div className="px-4 py-3 mx-3 mt-4 rounded-xl bg-white/5 border border-white/10">
        <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-0.5">
          Company
        </p>
        <p className="text-white text-sm font-medium truncate">{companyName}</p>
        <p className="text-white/40 text-xs font-mono">
          {activeCount} active employee{activeCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                transition-all group
                ${active
                  ? "bg-em text-[#002147] font-semibold"
                  : "text-white/60 hover:text-white hover:bg-white/8"
                }`}
            >
              <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-[#002147]" : ""}`} />
              {item.label}
              {active && <ChevronRight className="w-3 h-3 ml-auto text-[#002147]/60" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-5 space-y-1 border-t border-white/10 pt-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
          <div className="w-8 h-8 rounded-full bg-em/20 flex items-center justify-center flex-shrink-0">
            <span className="text-em text-xs font-bold">AD</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">Admin User</p>
            <p className="text-white/40 text-xs truncate">admin@company.lr</p>
          </div>
        </div>
        <button className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/40
                           hover:text-white/70 hover:bg-white/5 transition-all w-full">
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Main layout ────────────────────────────────────────────────────────────────
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {STYLES}
      <div className="flex h-screen bg-slate-50 overflow-hidden">

        {/* ── Desktop Sidebar ── */}
        <aside
          className="hidden md:flex flex-col flex-shrink-0 w-60 bg-navy"
          style={{ width: "var(--sidebar-w)" }}
        >
          <SidebarContent onClose={() => {}} />
        </aside>

        {/* ── Mobile Sidebar overlay ── */}
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

        {/* ── Main content area ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top bar */}
          <header className="flex-shrink-0 h-14 bg-white border-b border-slate-200
                             flex items-center justify-between px-4 sm:px-6">
            <button
              className="md:hidden text-slate-500 hover:text-slate-700"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden md:block" />
            <div className="flex items-center gap-3">
              <button className="relative text-slate-400 hover:text-slate-600 transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-em rounded-full" />
              </button>
              <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center">
                <span className="text-white text-xs font-bold">AD</span>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}