/**
 * Slipdesk — Mock Data
 * All demo data lives here. Swap out for Supabase calls when ready.
 */

import { calculatePayroll, type PayrollResult } from "./slipdesk-payroll-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmploymentType = "full_time" | "part_time" | "contractor" | "casual";
export type Currency = "USD" | "LRD";

export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  department: string;
  email: string;
  phone: string;
  county: string;
  startDate: string;
  employmentType: EmploymentType;
  currency: Currency;
  rate: number;
  standardHours: number;
  isActive: boolean;
  nasscorpNumber: string;
  bankName: string;
}

export interface PayRunLine {
  id: string;
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  jobTitle: string;
  department: string;
  currency: Currency;
  rate: number;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  additionalEarnings: number;
  exchangeRate: number;
  calc: PayrollResult | null;
}

export interface PayRun {
  id: string;
  periodLabel: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  status: "draft" | "review" | "approved" | "paid";
  employeeCount: number;
  totalGross: number;
  totalNet: number;
  totalPaye: number;
  totalNasscorp: number;
  currency: Currency;
}

// ─── Employees ────────────────────────────────────────────────────────────────

export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: "EMP-001",
    employeeNumber: "EMP-001",
    firstName: "Moses",
    lastName: "Kollie",
    fullName: "Moses Kollie",
    jobTitle: "Operations Manager",
    department: "Operations",
    email: "m.kollie@company.lr",
    phone: "+231 770 123 456",
    county: "Montserrado",
    startDate: "2021-03-15",
    employmentType: "full_time",
    currency: "USD",
    rate: 8.5,
    standardHours: 173.33,
    isActive: true,
    nasscorpNumber: "NSC-001-2021",
    bankName: "Ecobank Liberia",
  },
  {
    id: "EMP-002",
    employeeNumber: "EMP-002",
    firstName: "Fanta",
    lastName: "Kamara",
    fullName: "Fanta Kamara",
    jobTitle: "Senior Accountant",
    department: "Finance",
    email: "f.kamara@company.lr",
    phone: "+231 880 234 567",
    county: "Margibi",
    startDate: "2020-07-01",
    employmentType: "full_time",
    currency: "USD",
    rate: 12.0,
    standardHours: 173.33,
    isActive: true,
    nasscorpNumber: "NSC-002-2020",
    bankName: "LBDI",
  },
  {
    id: "EMP-003",
    employeeNumber: "EMP-003",
    firstName: "Emmanuel",
    lastName: "Toe",
    fullName: "Emmanuel Toe",
    jobTitle: "Field Technician",
    department: "Engineering",
    email: "e.toe@company.lr",
    phone: "+231 555 345 678",
    county: "Bong",
    startDate: "2022-01-10",
    employmentType: "full_time",
    currency: "LRD",
    rate: 1200,
    standardHours: 173.33,
    isActive: true,
    nasscorpNumber: "NSC-003-2022",
    bankName: "GTBank Liberia",
  },
  {
    id: "EMP-004",
    employeeNumber: "EMP-004",
    firstName: "Massa",
    lastName: "Dolo",
    fullName: "Massa Dolo",
    jobTitle: "Customer Service Rep",
    department: "Sales",
    email: "m.dolo@company.lr",
    phone: "+231 770 456 789",
    county: "Montserrado",
    startDate: "2023-05-20",
    employmentType: "part_time",
    currency: "USD",
    rate: 6.0,
    standardHours: 86.67,
    isActive: true,
    nasscorpNumber: "NSC-004-2023",
    bankName: "Access Bank",
  },
  {
    id: "EMP-005",
    employeeNumber: "EMP-005",
    firstName: "James",
    lastName: "Pewee",
    fullName: "James Pewee",
    jobTitle: "Software Developer",
    department: "Engineering",
    email: "j.pewee@company.lr",
    phone: "+231 880 567 890",
    county: "Montserrado",
    startDate: "2022-09-01",
    employmentType: "full_time",
    currency: "USD",
    rate: 18.0,
    standardHours: 173.33,
    isActive: true,
    nasscorpNumber: "NSC-005-2022",
    bankName: "Ecobank Liberia",
  },
  {
    id: "EMP-006",
    employeeNumber: "EMP-006",
    firstName: "Korto",
    lastName: "Williams",
    fullName: "Korto Williams",
    jobTitle: "HR Officer",
    department: "Human Resources",
    email: "k.williams@company.lr",
    phone: "+231 770 678 901",
    county: "Nimba",
    startDate: "2021-11-15",
    employmentType: "full_time",
    currency: "USD",
    rate: 10.5,
    standardHours: 173.33,
    isActive: true,
    nasscorpNumber: "NSC-006-2021",
    bankName: "LBDI",
  },
  {
    id: "EMP-007",
    employeeNumber: "EMP-007",
    firstName: "Thomas",
    lastName: "Sumo",
    fullName: "Thomas Sumo",
    jobTitle: "Driver",
    department: "Operations",
    email: "t.sumo@company.lr",
    phone: "+231 555 789 012",
    county: "Montserrado",
    startDate: "2023-02-01",
    employmentType: "casual",
    currency: "LRD",
    rate: 800,
    standardHours: 120,
    isActive: false,
    nasscorpNumber: "NSC-007-2023",
    bankName: "Access Bank",
  },
];

// ─── Exchange Rate ────────────────────────────────────────────────────────────

export const EXCHANGE_RATE = 193.5;

// ─── Current Pay Run Lines (June 2025) ───────────────────────────────────────

function buildPayRunLines(): PayRunLine[] {
  const activeEmployees = MOCK_EMPLOYEES.filter((e) => e.isActive);
  return activeEmployees.map((emp) => {
    const line: PayRunLine = {
      id: `LINE-${emp.id}`,
      employeeId: emp.id,
      employeeNumber: emp.employeeNumber,
      fullName: emp.fullName,
      jobTitle: emp.jobTitle,
      department: emp.department,
      currency: emp.currency,
      rate: emp.rate,
      regularHours: emp.standardHours,
      overtimeHours: emp.id === "EMP-001" ? 10 : emp.id === "EMP-005" ? 8 : 0,
      holidayHours: emp.id === "EMP-002" ? 8 : 0,
      additionalEarnings: emp.id === "EMP-002" ? 50 : 0,
      exchangeRate: EXCHANGE_RATE,
      calc: null,
    };
    line.calc = calculatePayroll({
      employeeId: line.employeeId,
      currency: line.currency,
      rate: line.rate,
      regularHours: line.regularHours,
      overtimeHours: line.overtimeHours,
      holidayHours: line.holidayHours,
      exchangeRate: line.exchangeRate,
      additionalEarnings: line.additionalEarnings,
    });
    return line;
  });
}

export const MOCK_PAY_RUN_LINES: PayRunLine[] = buildPayRunLines();

// ─── Pay Run History ──────────────────────────────────────────────────────────

export const MOCK_PAY_RUNS: PayRun[] = [
  {
    id: "RUN-2025-06",
    periodLabel: "June 2025",
    payPeriodStart: "2025-06-01",
    payPeriodEnd: "2025-06-30",
    payDate: "2025-06-30",
    status: "draft",
    employeeCount: 6,
    totalGross: 0,   // computed below
    totalNet: 0,
    totalPaye: 0,
    totalNasscorp: 0,
    currency: "USD",
  },
  {
    id: "RUN-2025-05",
    periodLabel: "May 2025",
    payPeriodStart: "2025-05-01",
    payPeriodEnd: "2025-05-31",
    payDate: "2025-05-31",
    status: "paid",
    employeeCount: 6,
    totalGross: 9124.5,
    totalNet: 8234.8,
    totalPaye: 524.3,
    totalNasscorp: 365.4,
    currency: "USD",
  },
  {
    id: "RUN-2025-04",
    periodLabel: "April 2025",
    payPeriodStart: "2025-04-01",
    payPeriodEnd: "2025-04-30",
    payDate: "2025-04-30",
    status: "paid",
    employeeCount: 6,
    totalGross: 8980.0,
    totalNet: 8105.2,
    totalPaye: 510.8,
    totalNasscorp: 364.0,
    currency: "USD",
  },
  {
    id: "RUN-2025-03",
    periodLabel: "March 2025",
    payPeriodStart: "2025-03-01",
    payPeriodEnd: "2025-03-31",
    payDate: "2025-03-31",
    status: "paid",
    employeeCount: 5,
    totalGross: 7650.0,
    totalNet: 6920.5,
    totalPaye: 430.5,
    totalNasscorp: 299.0,
    currency: "USD",
  },
];

// Compute current run totals from live calculations
const currentRunTotals = MOCK_PAY_RUN_LINES.reduce(
  (acc, line) => {
    if (!line.calc) return acc;
    const toUSD = (n: number) =>
      line.currency === "USD" ? n : n / EXCHANGE_RATE;
    return {
      gross: acc.gross + toUSD(line.calc.grossPay),
      net: acc.net + toUSD(line.calc.netPay),
      paye: acc.paye + toUSD(line.calc.paye.taxInBase),
      nasscorp:
        acc.nasscorp + toUSD(line.calc.nasscorp.employeeContribution),
    };
  },
  { gross: 0, net: 0, paye: 0, nasscorp: 0 }
);

MOCK_PAY_RUNS[0].totalGross = Math.round(currentRunTotals.gross * 100) / 100;
MOCK_PAY_RUNS[0].totalNet = Math.round(currentRunTotals.net * 100) / 100;
MOCK_PAY_RUNS[0].totalPaye = Math.round(currentRunTotals.paye * 100) / 100;
MOCK_PAY_RUNS[0].totalNasscorp =
  Math.round(currentRunTotals.nasscorp * 100) / 100;

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export const MOCK_DASHBOARD_STATS = {
  activeEmployees: MOCK_EMPLOYEES.filter((e) => e.isActive).length,
  totalEmployees: MOCK_EMPLOYEES.length,
  currentMonthGross: MOCK_PAY_RUNS[0].totalGross,
  currentMonthNet: MOCK_PAY_RUNS[0].totalNet,
  currentMonthPaye: MOCK_PAY_RUNS[0].totalPaye,
  currentMonthNasscorp: MOCK_PAY_RUNS[0].totalNasscorp,
  lastRunLabel: MOCK_PAY_RUNS[1].periodLabel,
  lastRunStatus: MOCK_PAY_RUNS[1].status,
  warningCount: MOCK_PAY_RUN_LINES.filter(
    (l) => l.calc && l.calc.warnings.length > 0
  ).length,
  platformFeeUSD:
    Math.round(
      MOCK_EMPLOYEES.filter((e) => e.isActive).length * 1.5 * 100
    ) / 100,
  monthlyTrend: [
    { month: "Jan", gross: 7200 },
    { month: "Feb", gross: 7400 },
    { month: "Mar", gross: 7650 },
    { month: "Apr", gross: 8980 },
    { month: "May", gross: 9124 },
    { month: "Jun", gross: MOCK_PAY_RUNS[0].totalGross },
  ],
};