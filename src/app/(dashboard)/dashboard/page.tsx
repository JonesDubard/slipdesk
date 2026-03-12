"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";

import {
  calculatePayroll,
  calcPepmBilling,
} from "@/lib/slipdesk-payroll-engine";

export default function DashboardPage() {
  const { employees } = useApp();

  /**
   * Default exchange rate until FX service exists
   */
  const exchangeRate = 185.44;

  /**
   * Build payroll inputs from employees
   */
  const payrollInputs = useMemo(() => {
    return employees
      .filter((emp) => emp.isActive)
      .map((emp) => ({
        employeeId: emp.id,
        currency: emp.currency,
        rate: emp.rate,
        regularHours: emp.standardHours,
        overtimeHours: 0,
        holidayHours: 0,
        exchangeRate,
        additionalEarnings: 0,
      }));
  }, [employees]);

  /**
   * Calculate payroll preview
   */
  const payrollPreview = useMemo(() => {
    const results = payrollInputs.map(calculatePayroll);

    const totalGross = results.reduce((s, r) => s + r.grossPay, 0);
    const totalNet = results.reduce((s, r) => s + r.netPay, 0);
    const totalPaye = results.reduce((s, r) => s + r.Paye.taxInBase, 0);
    const totalNasscorp = results.reduce(
      (s, r) => s + r.nasscorp.employeeContribution,
      0
    );

    const warnings = results.filter((r) => r.warnings.length > 0).length;

    return {
      results,
      totalGross,
      totalNet,
      totalPaye,
      totalNasscorp,
      warnings,
    };
  }, [payrollInputs]);

  /**
   * Platform fee
   */
  const billing = useMemo(() => {
    return calcPepmBilling(payrollInputs.length, exchangeRate);
  }, [payrollInputs]);

  /**
   * Dashboard stats object
   */
  const stats = {
    activeEmployees: payrollInputs.length,
    totalEmployees: employees.length,
    gross: payrollPreview.totalGross,
    Paye: payrollPreview.totalPaye,
    nasscorp: payrollPreview.totalNasscorp,
    net: payrollPreview.totalNet,
    warnings: payrollPreview.warnings,
    platformFee: billing.totalBillingUSD,
  };

  const monthLabel = new Date().toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {monthLabel} · Payroll preview
        </p>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Active Employees"
          value={stats.activeEmployees}
        />

        <StatCard
          label="Gross Payroll"
          value={`$${stats.gross.toFixed(2)}`}
        />

        <StatCard
          label="Paye Collected"
          value={`$${stats.Paye.toFixed(2)}`}
        />

        <StatCard
          label="NASSCORP"
          value={`$${stats.nasscorp.toFixed(2)}`}
        />

        <StatCard
          label="Net Payroll"
          value={`$${stats.net.toFixed(2)}`}
        />

        <StatCard
          label="Compliance Warnings"
          value={stats.warnings}
        />

        <StatCard
          label="Platform Fee"
          value={`$${stats.platformFee.toFixed(2)}`}
        />

        <StatCard
          label="Total Employees"
          value={stats.totalEmployees}
        />
      </div>

      {/* EMPLOYEE SNAPSHOT */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Employee Snapshot</h2>

        <div className="border rounded-lg">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="text-left p-3">Employee</th>
                <th className="text-left p-3">Currency</th>
                <th className="text-left p-3">Rate</th>
                <th className="text-left p-3">Gross</th>
                <th className="text-left p-3">Net</th>
              </tr>
            </thead>

            <tbody>
              {payrollPreview.results.slice(0, 5).map((result) => {
                const emp = employees.find(
                  (e) => e.id === result.employeeId
                );

                return (
                  <tr
                    key={result.employeeId}
                    className="border-b"
                  >
                    <td className="p-3">{emp?.fullName}</td>

                    <td className="p-3">
                      {result.currency}
                    </td>

                    <td className="p-3">
                      {result.currency} {emp?.rate}
                    </td>

                    <td className="p-3">
                      {result.currency}{" "}
                      {result.grossPay.toFixed(2)}
                    </td>

                    <td className="p-3">
                      {result.currency}{" "}
                      {result.netPay.toFixed(2)}
                    </td>
                  </tr>
                );
              })}

              {payrollPreview.results.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-6 text-center text-muted-foreground"
                  >
                    No employees yet. Add employees to preview payroll.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Small reusable stat component
 */
function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}