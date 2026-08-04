"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Shield, ClipboardList, ChevronRight } from "lucide-react";
import type { LinkedEmployee } from "@/lib/employee-portal/session";

export default function PortalHomePage() {
  const [employee, setEmployee] = useState<LinkedEmployee | null>(null);

  useEffect(() => {
    fetch("/api/employee/me")
      .then((r) => r.json())
      .then((d) => setEmployee(d.employee ?? null))
      .catch(() => setEmployee(null));
  }, []);

  const links = [
    {
      href: "/portal/payslips",
      title: "Payslip history",
      desc: "View paid payslips from the payroll engine.",
      icon: FileText,
    },
    {
      href: "/portal/nasscorp",
      title: "NASSCORP contributions",
      desc: "Cumulative employee and employer contributions.",
      icon: Shield,
    },
    {
      href: "/portal/requests",
      title: "Update my details",
      desc: "Request changes to address, bank, or phone — HR must approve.",
      icon: ClipboardList,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#002147]">
          Welcome{employee ? `, ${employee.firstName}` : ""}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          View your payslips and NASSCORP contributions. Profile changes go to HR for approval.
        </p>
      </div>

      {employee && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 text-sm">
          <p className="font-medium text-slate-800">{employee.fullName}</p>
          <p className="text-slate-500 mt-0.5">
            {employee.jobTitle || "—"} · {employee.department || "—"}
          </p>
          <p className="text-slate-400 font-mono text-xs mt-2">{employee.phone}</p>
        </div>
      )}

      <div className="space-y-3">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 hover:border-[#50C878]/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-[#002147]/5 flex items-center justify-center">
                <Icon className="w-5 h-5 text-[#002147]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800">{item.title}</p>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
