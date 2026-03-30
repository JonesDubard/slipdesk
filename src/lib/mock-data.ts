/**
 * Slipdesk — Types & Interfaces
 * No mock data. All runtime data lives in AppContext (→ Supabase later).
 */

import { calculatePayroll, type PayrollResult } from "./slipdesk-payroll-engine";

// ─── Enums / Union Types ──────────────────────────────────────────────────────

export type EmploymentType = "full_time" | "part_time" | "contractor" | "casual";
export type Currency       = "USD" | "LRD";
export type PaymentMethod  = "bank_transfer" | "mtn_momo" | "orange_money" | "cash";


export interface DeductionItem {
  label:  string;   // e.g. "Pay Advance", "Food", "Transportation"
  note?:  string;  // optional explanation shown on payslip
  amount: number;
}

// ─── Employee ─────────────────────────────────────────────────────────────────

export interface Employee {
  // ── Identity ──
  id:             string;
  employeeNumber: string;
  firstName:      string;
  lastName:       string;
  fullName:       string;
  jobTitle:       string;
  department:     string;
  email:          string;
  phone:          string;
  county:         string;
  startDate:      string;
  nasscorpNumber: string;

  // ── Employment ──
  employmentType: EmploymentType;
  isActive:       boolean;

  /** Soft-delete flag. True = moved to Archived view, excluded from payroll. */
  isArchived:     boolean;

  // ── Compensation ──
  currency:      Currency;
  rate:          number;           // hourly rate in base currency
  standardHours: number;           // monthly standard hours (e.g. 173.33)

  /** Recurring monthly allowances (transport, housing, etc.) added to gross */
  allowances:    number;

  // ── Pending payroll overrides (set via CSV import, consumed when pay run starts) ──
  // These are NOT stored permanently — they pre-fill the pay run grid for the
  // current period so the client doesn't have to type them manually.
  // Once the pay run is started these values are used and can then be cleared.
  /** Pre-filled regular hours for next pay run (null = use standardHours) */
  pendingRegularHours?:  number | null;
  /** Pre-filled overtime hours for next pay run (null = 0) */
  pendingOvertimeHours?: number | null;
  /** Pre-filled holiday hours for next pay run (null = 0) */
  pendingHolidayHours?:  number | null;
  /** Pre-filled deduction for next pay run (null = 0) */
  pendingDeductions?:    number | null;

  // ── Payment / Disbursement ──
  paymentMethod: PaymentMethod;

  /** Bank Transfer fields */
  bankName:      string;
  accountNumber: string;

  /** Mobile Money fields (MTN / Orange) */
  momoNumber:    string;
}

// ─── PayRunLine ───────────────────────────────────────────────────────────────

export interface PayRunLine {
  id:                 string;
  employeeId:         string;
  employeeNumber:     string;
  fullName:           string;
  jobTitle:           string;
  department:         string;
  currency:           Currency;
  rate:               number;
  regularHours:       number;
  overtimeHours:      number;
  holidayHours:       number;
  additionalEarnings: number; 
  deductionItems?:  DeductionItem[];
  deductions?:         number;

  exchangeRate:       number;
  calc:               PayrollResult | null;

  // ── Payment details (copied from Employee; shown on payslip PDF) ──────────
  paymentMethod?:  PaymentMethod;
  bankName?:       string;
  accountNumber?:  string;
  /** MTN MoMo / Orange Money number (from Employee.momoNumber) */
  mobileNumber?:   string;
  mobileProvider?: string;
}

// ─── PayRun ───────────────────────────────────────────────────────────────────

export interface PayRun {
  id:             string;
  periodLabel:    string;
  payPeriodStart: string;
  payPeriodEnd:   string;
  payDate:        string;
  status:         "draft" | "review" | "approved" | "paid";
  employeeCount:  number;
  totalGross:     number;
  totalNet:       number;
  totalIncomeTax: number;   // renamed from totalPaye
  totalNasscorp:  number;
  currency:       Currency;
}

// ─── Company Profile ──────────────────────────────────────────────────────────

export interface CompanyProfile {
  name:          string;
  tin:           string;
  nasscorpRegNo: string;
  address:       string;
  phone:         string;
  email:         string;
  /** Public URL from Supabase Storage, or null if not uploaded */
  logoUrl:       string | null;
}


export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name:          "",
  tin:           "",
  nasscorpRegNo: "",
  address:       "",
  phone:         "",
  email:         "",
  logoUrl:       null,
};

// ─── Re-export engine types used across the app ───────────────────────────────

export type { PayrollResult };
export { calculatePayroll };