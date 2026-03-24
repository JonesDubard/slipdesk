/**
 * Slipdesk — Supabase Database Types
 * Place at: src/lib/supabase/types.ts
 *
 * IMPORTANT: Insert/Update types must be inlined inside the Database interface.
 * Do NOT reference aliases (Companies, Employees, etc.) inside the interface —
 * TypeScript resolves them as `never` because the aliases are declared after
 * the interface closes.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ─── Row shapes (used in Insert/Update below) ─────────────────────────────────

type CompanyRow = {
  id:              string;
  owner_id:        string;
  name:            string;
  tin:             string;
  nasscorp_reg_no: string;
  address:         string;
  phone:           string;
  email:           string;
  logo_url:        string | null;
  billing_bypass:  boolean;
  created_at:      string;
  updated_at:      string;
};

type EmployeeRow = {
  id:              string;
  company_id:      string;
  employee_number: string;
  first_name:      string;
  last_name:       string;
  full_name:       string; // generated column — omit on insert
  job_title:       string;
  department:      string;
  email:           string;
  phone:           string;
  county:          string;
  start_date:      string | null;
  employment_type: "full_time" | "part_time" | "contractor" | "casual";
  currency:        "USD" | "LRD";
  rate:            number;
  standard_hours:  number;
  allowances:      number;
  nasscorp_number: string;
  payment_method:  "bank_transfer" | "mtn_momo" | "orange_money" | "cash";
  bank_name:       string;
  account_number:  string;
  momo_number:     string;
  is_active:       boolean;
  is_archived:     boolean;
  created_at:      string;
  updated_at:      string;
};

type PayRunRow = {
  id:               string;
  company_id:       string;
  period_label:     string;
  pay_period_start: string;
  pay_period_end:   string;
  pay_date:         string;
  exchange_rate:    number;
  status:           "draft" | "review" | "approved" | "paid";
  employee_count:   number;
  total_gross:      number;
  total_net:        number;
  total_income_tax: number;
  total_nasscorp:   number;
  created_at:       string;
  updated_at:       string;
};

type PayRunLineRow = {
  id:                  string;
  pay_run_id:          string;
  company_id:          string;
  employee_id:         string;
  employee_number:     string;
  full_name:           string;
  job_title:           string;
  department:          string;
  currency:            "USD" | "LRD";
  rate:                number;
  regular_hours:       number;
  overtime_hours:      number;
  holiday_hours:       number;
  additional_earnings: number;
  exchange_rate:       number;
  gross_pay:           number;
  income_tax:          number;
  nasscorp_ee:         number;
  nasscorp_er:         number;
  net_pay:             number;
  created_at:          string;
};

type BillingEventRow = {
  id:             string;
  company_id:     string;
  period_label:   string;
  employee_count: number;
  amount_usd:     number;
  status:         "pending" | "success" | "failed";
  flw_reference:  string | null;
  flw_tx_id:      string | null;
  payment_method: string | null;
  paid_at:        string | null;
  created_at:     string;
};

// ─── Database interface ───────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: CompanyRow;
        Insert: Omit<CompanyRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<CompanyRow, "id" | "created_at" | "updated_at">>;
      };
      employees: {
        Row: EmployeeRow;
        Insert: Omit<EmployeeRow, "id" | "full_name" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<EmployeeRow, "id" | "company_id" | "full_name" | "created_at" | "updated_at">>;
      };
      pay_runs: {
        Row: PayRunRow;
        Insert: Omit<PayRunRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<PayRunRow, "id" | "created_at" | "updated_at">>;
      };
      pay_run_lines: {
        Row: PayRunLineRow;
        Insert: Omit<PayRunLineRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<PayRunLineRow, "id" | "created_at">>;
      };
      billing_events: {
        Row: BillingEventRow;
        Insert: Omit<BillingEventRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<BillingEventRow, "id" | "created_at">>;
      };
    };
    Functions: {
      my_company_id: { Args: Record<string, never>; Returns: string };
    };
  };
}

// ─── Exported row types used across the app ───────────────────────────────────

export type DbCompany      = CompanyRow;
export type DbEmployee     = EmployeeRow;
export type DbPayRun       = PayRunRow;
export type DbPayRunLine   = PayRunLineRow;
export type DbBillingEvent = BillingEventRow;