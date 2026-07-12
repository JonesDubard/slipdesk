/**
 * Slipdesk — Supabase Database Types
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ─── Row shapes ───────────────────────────────────────────────────────────────

type CompanyRow = {
  id:                     string;
  owner_id:               string;
  name:                   string;
  tin:                    string;
  nasscorp_reg_no:        string;
  address:                string;
  phone:                  string;
  email:                  string;
  logo_url:               string | null;
  billing_bypass:         boolean;
  is_demo?:               boolean;
  subscription_tier:      "basic" | "standard" | "premium";
  subscription_status:    "trial" | "active" | "past_due" | "cancelled";
  subscription_expires_at: string | null;
  trial_expires_at:       string | null;
  is_locked:              boolean;
  locked_reason:          string | null;
  mtn_momo_phone:         string | null;
  admin_email:            string | null;
  pricing_model:          string;
  // ── Company administration / branding (migration 0001) ──
  brand_primary_color?:   string | null;
  brand_secondary_color?: string | null;
  email_footer?:          string | null;
  payslip_footer?:        string | null;
  created_at:             string;
  updated_at:             string;
};

type EmployeeRow = {
  id:               string;
  company_id:       string;
  employee_number:  string;
  first_name:       string;
  last_name:        string;
  full_name:        string;
  job_title:        string;
  department:       string;
  email:            string;
  phone:            string;
  county:           string;
  start_date:       string | null;
  employment_type:  "full_time" | "part_time" | "contractor" | "casual";
  currency:         "USD" | "LRD";
  rate:             number;
  standard_hours:   number;
  allowances:       number;
  nasscorp_number:  string;
  payment_method:   "bank_transfer" | "mtn_momo" | "orange_money" | "cash";
  bank_name:        string;
  account_number:   string;
  momo_number:      string;
  is_active:        boolean;
  is_archived:      boolean;
  created_at:       string;
  updated_at:       string;
  pending_regular_hours:  number | null;
  pending_overtime_hours: number | null;
  pending_holiday_hours:  number | null;
  pending_deductions:     number | null;
  // ── Extended employee profile (migration 0001) ──
  branch?:            string | null;
  position?:          string | null;
  tax_id?:            string | null;
  employment_status?: string | null;
  bank_branch?:       string | null;
  date_terminated?:   string | null;
};

type PayRunRow = {
  id:                string;
  company_id:        string;
  period_label:      string;
  pay_period_start:  string;
  pay_period_end:    string;
  pay_date:          string;
  exchange_rate:     number;
  status:            "draft" | "review" | "approved" | "locked" | "archived" | "paid";
  employee_count:    number;
  total_gross:       number;
  total_net:         number;
  total_income_tax:  number;
  total_nasscorp:    number;
  created_at:        string;
  updated_at:        string;
  // ── Payroll lifecycle & run types (migration 0001) ──
  run_type?:         string | null;
  workflow_stage?:   string | null;
  locked_at?:        string | null;
  archived_at?:      string | null;
  approved_by?:      string | null;
  reopened_by?:      string | null;
  reopened_at?:      string | null;
};

type PayRunLineRow = {
  id:                   string;
  pay_run_id:           string;
  company_id:           string;
  employee_id:          string;
  employee_number:      string;
  full_name:            string;
  job_title:            string;
  department:           string;
  currency:             "USD" | "LRD";
  rate:                 number;
  regular_hours:        number;
  overtime_hours:       number;
  holiday_hours:        number;
  additional_earnings:  number;
  exchange_rate:        number;
  gross_pay:            number;
  income_tax:           number;
  nasscorp_ee:          number;
  nasscorp_er:          number;
  net_pay:              number;
  created_at:           string;
};

type BillingEventRow = {
  id:              string;
  company_id:      string;
  period_label:    string;
  employee_count:  number;
  amount_usd:      number;
  status:          "pending" | "success" | "failed";
  flw_reference:   string | null;
  flw_tx_id:       string | null;
  payment_method:  string | null;
  paid_at:         string | null;
  created_at:      string;
};

type PaymentRow = {
  id:              string;
  company_id:      string;
  amount:          number;
  month:           string;
  status:          "pending" | "confirmed" | "rejected";
  tier_requested:  "basic" | "standard" | "premium";
  receipt_note:    string | null;
  receipt_url:     string | null;
  confirmed_by:    string | null;
  confirmed_at:    string | null;
  rejected_reason: string | null;
  created_at:      string;
};

type FaqRow = {
  id:         string;
  question:   string;
  answer:     string;
  sort_order: number;
  is_active:  boolean;
  created_at: string;
  updated_at: string;
};

// ─── Platform expansion tables (migration 0001) ─────────────────────────────

type EmployeeSalaryHistoryRow = {
  id:             string;
  company_id:     string;
  employee_id:    string;
  currency:       string;
  old_rate:       number | null;
  new_rate:       number;
  effective_date: string;
  changed_by:     string | null;
  note:           string | null;
  created_at:     string;
};

type CompanyMemberRow = {
  id:            string;
  company_id:    string;
  user_id:       string | null;
  role:          "super_admin" | "company_owner" | "payroll_officer" |
                 "finance_manager" | "hr_manager" | "auditor" | "executive";
  invited_email: string | null;
  status:        "pending" | "active";
  created_at:    string;
};

type AuditLogRow = {
  id:          string;
  company_id:  string;
  actor_id:    string | null;
  actor_email: string | null;
  action:      string;
  entity_type: string | null;
  entity_id:   string | null;
  old_value:   Json | null;
  new_value:   Json | null;
  ip_address:  string | null;
  created_at:  string;
};

type NotificationRow = {
  id:         string;
  company_id: string;
  user_id:    string | null;
  type:       string;
  title:      string;
  body:       string | null;
  severity:   "info" | "success" | "warning" | "critical";
  link:       string | null;
  is_read:    boolean;
  created_at: string;
};

type ComplianceSnapshotRow = {
  id:             string;
  company_id:     string;
  period_label:   string;
  score:          number;
  critical_count: number;
  warning_count:  number;
  payroll_ready:  boolean;
  lra_ready:      boolean;
  nasscorp_ready: boolean;
  details:        Json | null;
  created_at:     string;
};

// ─── Database interface ───────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      companies: {
        Row:    CompanyRow;
        Insert: Omit<CompanyRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<CompanyRow, "id" | "created_at" | "updated_at">>;
      };
      employees: {
        Row:    EmployeeRow;
        Insert: Omit<EmployeeRow, "id" | "full_name" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<EmployeeRow, "id" | "company_id" | "full_name" | "created_at" | "updated_at">>;
      };
      pay_runs: {
        Row:    PayRunRow;
        Insert: Omit<PayRunRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<PayRunRow, "id" | "created_at" | "updated_at">>;
      };
      pay_run_lines: {
        Row:    PayRunLineRow;
        Insert: Omit<PayRunLineRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<PayRunLineRow, "id" | "created_at">>;
      };
      billing_events: {
        Row:    BillingEventRow;
        Insert: Omit<BillingEventRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<BillingEventRow, "id" | "created_at">>;
      };
      payments: {
        Row:    PaymentRow;
        Insert: Omit<PaymentRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<PaymentRow, "id" | "created_at">>;
      };
      faqs: {
        Row:    FaqRow;
        Insert: Omit<FaqRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<FaqRow, "id" | "created_at" | "updated_at">>;
      };
      employee_salary_history: {
        Row:    EmployeeSalaryHistoryRow;
        Insert: Omit<EmployeeSalaryHistoryRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<EmployeeSalaryHistoryRow, "id" | "created_at">>;
      };
      company_members: {
        Row:    CompanyMemberRow;
        Insert: Omit<CompanyMemberRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<CompanyMemberRow, "id" | "created_at">>;
      };
      audit_log: {
        Row:    AuditLogRow;
        Insert: Omit<AuditLogRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<AuditLogRow, "id" | "created_at">>;
      };
      notifications: {
        Row:    NotificationRow;
        Insert: Omit<NotificationRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<NotificationRow, "id" | "created_at">>;
      };
      compliance_snapshots: {
        Row:    ComplianceSnapshotRow;
        Insert: Omit<ComplianceSnapshotRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<ComplianceSnapshotRow, "id" | "created_at">>;
      };
      // ═══ ADD THIS NEW TABLE ═══
      payslip_generations: {
        Row: {
          id: string;
          company_id: string;
          employee_id: string;
          billing_period_start: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          employee_id: string;
          billing_period_start: string;
          created_at?: string;
        };
        Update: Partial<{
          company_id: string;
          employee_id: string;
          billing_period_start: string;
          created_at: string;
        }>;
      };
    };
    Functions: {
      my_company_id: { Args: Record<string, never>; Returns: string };
    };
  };
}

// ─── Exported row types ───────────────────────────────────────────────────────
export type DbCompany      = CompanyRow;
export type DbEmployee     = EmployeeRow;
export type DbPayRun       = PayRunRow;
export type DbPayRunLine   = PayRunLineRow;
export type DbBillingEvent = BillingEventRow;
export type DbPayment      = PaymentRow;
export type DbFaq          = FaqRow;
export type DbEmployeeSalaryHistory = EmployeeSalaryHistoryRow;
export type DbCompanyMember  = CompanyMemberRow;
export type DbAuditLog       = AuditLogRow;
export type DbNotification   = NotificationRow;
export type DbComplianceSnapshot = ComplianceSnapshotRow;