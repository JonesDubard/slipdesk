/**
 * Slipdesk — Types & Interfaces
 * No mock data. All runtime data lives in AppContext (→ Supabase later).
 */

import { calculatePayroll, type PayrollResult } from "./slipdesk-payroll-engine";

// ─── Enums / Union Types ──────────────────────────────────────────────────────

export type EmploymentType = "full_time" | "part_time" | "contractor" | "casual";
export type Currency       = "USD" | "LRD";
export type PaymentMethod  = "bank_transfer" | "mtn_momo" | "orange_money" | "cash";

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
  additionalEarnings: number;  // one-off extras on top of recurring allowances
  exchangeRate:       number;
  calc:               PayrollResult | null;
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