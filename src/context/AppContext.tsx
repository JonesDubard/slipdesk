"use client";

import {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, type ReactNode,
} from "react";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { DbEmployee, DbCompany } from "@/lib/supabase/types";
import { normalizeRole, type Role } from "@/lib/rbac";
import { resolveAppRole } from "@/lib/nav";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { DemoReadonlyError } from "@/lib/demo/errors";
import type { DemoFeatureName } from "@/lib/demo/constants";

function blockIfDemo(isDemo: boolean, feature: DemoFeatureName) {
  if (!isDemo) return;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("slipdesk:demo-readonly", { detail: { feature } }),
    );
  }
  throw new DemoReadonlyError(feature);
}

export type Currency       = "USD" | "LRD";
export type EmploymentType = "full_time" | "part_time" | "contractor" | "casual";
export type PaymentMethod  = "bank_transfer" | "mtn_momo" | "orange_money" | "cash";
export type SubscriptionTier   = "basic" | "standard" | "premium";
export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled";

export interface Employee {
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
  employmentType: EmploymentType;
  currency:       Currency;
  rate:           number;
  standardHours:  number;
  allowances:     number;
  nasscorpNumber: string;
  paymentMethod:  PaymentMethod;
  bankName:       string;
  accountNumber:  string;
  momoNumber:     string;
  isActive:       boolean;
  isArchived:     boolean;
  // ── Extended profile (migration 0001) ── optional so existing call sites
  //    that build Employee objects continue to compile unchanged.
  branch?:            string;
  position?:          string;
  taxId?:             string;
  employmentStatus?:  string;
  bankBranch?:        string;
  dateTerminated?:    string | null;
  pendingRegularHours?:  number | null;
  pendingOvertimeHours?: number | null;
  pendingHolidayHours?:  number | null;
  pendingDeductions?:    number | null;
}

export interface CompanyProfile {
  id:                   string;
  name:                 string;
  tin:                  string;
  nasscorpRegNo:        string;
  address:              string;
  phone:                string;
  email:                string;
  logoUrl:              string | null;
  billingBypass:        boolean;
  /** Shared Interactive Demo tenant — all mutations are blocked. */
  isDemo:               boolean;
  // ── NEW billing fields ──
  subscriptionTier:     SubscriptionTier;
  subscriptionStatus:   SubscriptionStatus;
  subscriptionExpiresAt: string | null;
  trialExpiresAt:       string | null;
  isLocked:             boolean;
  lockedReason:         string | null;
  mtnMomoPhone: string | null;
  // ── Company administration / branding (migration 0001) ──
  brandPrimaryColor:    string;
  brandSecondaryColor:  string;
  emailFooter:          string;
  payslipFooter:        string;
}

export const EMPTY_COMPANY: CompanyProfile = {
  id: "", name: "", tin: "", nasscorpRegNo: "",
  address: "", phone: "", email: "", logoUrl: null,
  billingBypass: false,
  isDemo: false,
  subscriptionTier: "basic",
  subscriptionStatus: "trial",
  subscriptionExpiresAt: null,
  trialExpiresAt: null,
  isLocked: false,
  lockedReason: null,
  mtnMomoPhone: null,
  brandPrimaryColor: "#002147",
  brandSecondaryColor: "#50C878",
  emailFooter: "",
  payslipFooter: "",
};

function dbToEmployee(row: DbEmployee): Employee {
  return {
    id:             row.id,
    employeeNumber: row.employee_number,
    firstName:      row.first_name,
    lastName:       row.last_name,
    fullName:       row.full_name,
    jobTitle:       row.job_title,
    department:     row.department,
    email:          row.email,
    phone:          row.phone,
    county:         row.county,
    startDate:      row.start_date ?? "",
    employmentType: row.employment_type,
    currency:       row.currency,
    rate:           Number(row.rate),
    standardHours:  Number(row.standard_hours),
    allowances:     Number(row.allowances),
    nasscorpNumber: row.nasscorp_number,
    paymentMethod:  row.payment_method,
    bankName:       row.bank_name,
    accountNumber:  row.account_number,
    momoNumber:     row.momo_number,
    isActive:       row.is_active,
    isArchived:     row.is_archived,
    branch:            row.branch ?? "",
    position:          row.position ?? "",
    taxId:             row.tax_id ?? "",
    employmentStatus:  row.employment_status ?? "active",
    bankBranch:        row.bank_branch ?? "",
    dateTerminated:    row.date_terminated ?? null,
    pendingRegularHours:  row.pending_regular_hours  ?? null,
    pendingOvertimeHours: row.pending_overtime_hours ?? null,
    pendingHolidayHours:  row.pending_holiday_hours  ?? null,
    pendingDeductions:    row.pending_deductions     ?? null,
  };
}

function dbToCompany(row: DbCompany): CompanyProfile {
  return {
    id:                   row.id,
    name:                 row.name,
    tin:                  row.tin,
    nasscorpRegNo:        row.nasscorp_reg_no,
    address:              row.address,
    phone:                row.phone,
    email:                row.email,
    logoUrl:              row.logo_url,
    billingBypass:        row.billing_bypass ?? false,
    isDemo:               Boolean((row as DbCompany & { is_demo?: boolean }).is_demo),
    subscriptionTier:     (row.subscription_tier as SubscriptionTier) ?? "basic",
    subscriptionStatus:   (row.subscription_status as SubscriptionStatus) ?? "trial",
    subscriptionExpiresAt: row.subscription_expires_at ?? null,
    trialExpiresAt:       row.trial_expires_at ?? null,
    isLocked:             row.is_locked ?? false,
    lockedReason:         row.locked_reason ?? null,
    mtnMomoPhone: row.mtn_momo_phone ?? null,
    brandPrimaryColor:    row.brand_primary_color ?? "#002147",
    brandSecondaryColor:  row.brand_secondary_color ?? "#50C878",
    emailFooter:          row.email_footer ?? "",
    payslipFooter:        row.payslip_footer ?? "",
  };
}

interface AppState {
  user:         User | null;
  role:         Role;
  loading:      boolean;
  initializing: boolean;
  company:    CompanyProfile;
  setCompany: (profile: Partial<CompanyProfile>) => Promise<void>;
  employees:          Employee[];
  archivedEmployees:  Employee[];
  addEmployee:        (data: Omit<Employee, "id" | "fullName" | "isArchived">, employeeNumber?: string) => Promise<Employee | null>;
  refreshEmployees:   () => Promise<void>;
  updateEmployee:     (id: string, data: Partial<Employee>) => Promise<void>;
  archiveEmployee:    (id: string) => Promise<void>;
  restoreEmployee:    (id: string) => Promise<void>;
  hardDeleteEmployee: (id: string) => Promise<void>;
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  signOut: () => Promise<void>;
  refreshCompany: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(supabase: ReturnType<typeof createClient>): any { return supabase as any; }

/** Resolve the active company for an authenticated user (owner, profile link, or team member). */
async function resolveCompanyForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ company: DbCompany | null; memberRole: Role | null }> {
  const { data: owned } = await db(supabase)
    .from("companies")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (owned?.[0]) return { company: owned[0] as DbCompany, memberRole: null };

  const { data: profile } = await db(supabase)
    .from("profiles")
    .select("company_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.company_id) {
    const { data: co } = await db(supabase)
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .single();
    if (co) {
      return {
        company: co as DbCompany,
        memberRole: profile.role ? normalizeRole(profile.role) : null,
      };
    }
  }

  // Requires migration 0001 — silently skipped if the table is not provisioned.
  const { data: member, error: memberErr } = await db(supabase)
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!memberErr && member?.company_id) {
    const { data: co } = await db(supabase)
      .from("companies")
      .select("*")
      .eq("id", member.company_id)
      .single();
    if (co) {
      return { company: co as DbCompany, memberRole: normalizeRole(member.role) };
    }
  }

  return { company: null, memberRole: null };
}

/** Ensure pending team invites are activated after login / refresh. */
async function activatePendingInvite(): Promise<void> {
  try {
    await fetch("/api/auth/activate-invite", { method: "POST" });
  } catch {
    // Non-fatal — bootstrap on sign-in should have already run.
  }
}

let _hasBooted = false;

export function AppProvider({ children }: { children: ReactNode }) {
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const supabase = sbRef.current;

  const [user,         setUser]         = useState<User | null>(null);
  const [booted,       setBooted]       = useState(_hasBooted);
  const [dataLoading,  setDataLoading]  = useState(false);
  const [company,      setCompanyState] = useState<CompanyProfile>(EMPTY_COMPANY);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [role,         setRole]         = useState<Role>("payroll_officer");

  const loading = !booted;

  // ── Boot & auth state listener ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function boot() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(currentUser);
      if (currentUser) {
        setDataLoading(true);
        await loadData();
        if (mounted) setDataLoading(false);
      }
      if (mounted) { _hasBooted = true; setBooted(true); }
    }

    boot();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        const newUser = session?.user ?? null;
        setUser(newUser);
        if (newUser) {
          if (event === "SIGNED_IN" || event === "USER_UPDATED") {
            setDataLoading(true);
            await loadData();
            if (mounted) setDataLoading(false);
          }
        } else {
          setCompanyState(EMPTY_COMPANY);
          setAllEmployees([]);
          setRole("payroll_officer");
        }
      },
    );

    return () => { mounted = false; subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData(retries = 3) {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;

    await activatePendingInvite();

    const [{ company: co, memberRole }, { data: profileRows }] = await Promise.all([
      resolveCompanyForUser(supabase, currentUser.id),
      db(supabase)
        .from("profiles")
        .select("role")
        .eq("id", currentUser.id)
        .limit(1),
    ]);

    const rawRole = profileRows?.[0]?.role ?? null;

    if (!co && retries > 0) {
      await new Promise((r) => setTimeout(r, 800));
      return loadData(retries - 1);
    }
    if (co) {
      setCompanyState(dbToCompany(co));
      setRole(resolveAppRole(memberRole, rawRole));

      // Keep profile.company_id synced for owners so RLS helpers resolve correctly.
      if (!memberRole) {
        void db(supabase).from("profiles").update({ company_id: co.id }).eq("id", currentUser.id);
      }

      const { data: emps } = await db(supabase)
        .from("employees")
        .select("*")
        .eq("company_id", co.id)
        .order("employee_number");
      if (emps) setAllEmployees((emps as DbEmployee[]).map(dbToEmployee));
    } else {
      setRole(normalizeRole(rawRole));
      setAllEmployees([]);
    }
  }

  const employees:         Employee[] = allEmployees.filter((e) => !e.isArchived);
  const archivedEmployees: Employee[] = allEmployees.filter((e) =>  e.isArchived);

  const setCompany = useCallback(async (profile: Partial<CompanyProfile>) => {
    blockIfDemo(company.isDemo, "settings");
    const base = {
      ...(profile.name          !== undefined && { name:            profile.name          }),
      ...(profile.tin           !== undefined && { tin:             profile.tin           }),
      ...(profile.nasscorpRegNo !== undefined && { nasscorp_reg_no: profile.nasscorpRegNo }),
      ...(profile.address       !== undefined && { address:         profile.address       }),
      ...(profile.phone         !== undefined && { phone:           profile.phone         }),
      ...(profile.email         !== undefined && { email:           profile.email         }),
      ...(profile.logoUrl       !== undefined && { logo_url:        profile.logoUrl       }),
      ...(profile.mtnMomoPhone  !== undefined && { mtn_momo_phone:  profile.mtnMomoPhone  }),
    };
    // Branding columns are added by migration 0001. Keep them separate so we
    // can retry without them if the migration has not been applied yet.
    const branding = {
      ...(profile.brandPrimaryColor   !== undefined && { brand_primary_color:   profile.brandPrimaryColor   }),
      ...(profile.brandSecondaryColor !== undefined && { brand_secondary_color: profile.brandSecondaryColor }),
      ...(profile.emailFooter         !== undefined && { email_footer:          profile.emailFooter         }),
      ...(profile.payslipFooter       !== undefined && { payslip_footer:        profile.payslipFooter       }),
    };

    if (company.id) {
      let { error } = await db(supabase).from("companies").update({ ...base, ...branding }).eq("id", company.id);
      // Fallback: retry without branding columns if they don't exist yet.
      if (error && Object.keys(branding).length > 0) {
        ({ error } = await db(supabase).from("companies").update(base).eq("id", company.id));
      }
      if (error) throw error;
      const { data } = await db(supabase).from("companies").select("*").eq("id", company.id).single();
      if (data) setCompanyState(dbToCompany(data as DbCompany));
      logAudit({ companyId: company.id, action: "company.update", entityType: "company", entityId: company.id, newValue: profile });
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await db(supabase).from("companies").upsert({ owner_id: user.id, email: user.email ?? "", ...base });
      await loadData();
    }
  }, [company.id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextEmpNumber = useCallback((currentList: Employee[] = allEmployees) => {
    const nums = currentList
      .map((e) => parseInt(e.employeeNumber.replace(/\D/g, ""), 10))
      .filter(Boolean);
    return `EMP-${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
  }, [allEmployees]);

  const addEmployee = useCallback(async (
    data: Omit<Employee, "id" | "fullName" | "isArchived">,
    employeeNumber?: string,
  ): Promise<Employee | null> => {
    blockIfDemo(company.isDemo, "add_employee");
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) throw new Error("Not authenticated");

    let coId = company.id;
    if (!coId) {
      const resolved = await resolveCompanyForUser(supabase, currentUser.id);
      coId = resolved.company?.id ?? "";
    }
    if (!coId) throw new Error("Company not found. Please set up your company profile first.");

    const finalNumber = employeeNumber || data.employeeNumber || nextEmpNumber();

    const baseInsert = {
      company_id:      coId,
      employee_number: finalNumber,
      first_name:      data.firstName,
      last_name:       data.lastName,
      job_title:       data.jobTitle,
      department:      data.department,
      email:           data.email,
      phone:           data.phone,
      county:          data.county,
      start_date:      data.startDate || null,
      employment_type: data.employmentType,
      currency:        data.currency,
      rate:            data.rate,
      standard_hours:  data.standardHours,
      allowances:      data.allowances,
      nasscorp_number: data.nasscorpNumber,
      payment_method:  data.paymentMethod,
      bank_name:       data.bankName,
      account_number:  data.accountNumber,
      momo_number:     data.momoNumber,
      is_active:       data.isActive,
      is_archived:     false,
      ...(data.pendingRegularHours  !== undefined && { pending_regular_hours:  data.pendingRegularHours  }),
      ...(data.pendingOvertimeHours !== undefined && { pending_overtime_hours: data.pendingOvertimeHours }),
      ...(data.pendingHolidayHours  !== undefined && { pending_holiday_hours:  data.pendingHolidayHours  }),
      ...(data.pendingDeductions    !== undefined && { pending_deductions:     data.pendingDeductions    }),
    };
    // Extended profile columns (migration 0001). Kept separate for graceful fallback.
    const extended = {
      ...(data.branch           !== undefined && { branch:            data.branch           }),
      ...(data.position         !== undefined && { position:          data.position         }),
      ...(data.taxId            !== undefined && { tax_id:            data.taxId            }),
      ...(data.employmentStatus !== undefined && { employment_status: data.employmentStatus }),
      ...(data.bankBranch       !== undefined && { bank_branch:       data.bankBranch       }),
    };

    let res = await db(supabase).from("employees").insert({ ...baseInsert, ...extended }).select().single();
    if (res.error && Object.keys(extended).length > 0) {
      // Retry without extended columns if the migration hasn't been applied.
      res = await db(supabase).from("employees").insert(baseInsert).select().single();
    }
    if (res.error) throw res.error;
    const row = res.data;
    if (!row) throw new Error("Failed to insert employee – no row returned.");

    const mapped = dbToEmployee(row as DbEmployee);
    setAllEmployees((prev) => [...prev, mapped]);

    logAudit({ companyId: coId, action: "employee.create", entityType: "employee", entityId: mapped.id, newValue: { name: mapped.fullName, number: mapped.employeeNumber } });
    createNotification({ companyId: coId, type: "employee_added", title: "Employee added", body: `${mapped.fullName} (${mapped.employeeNumber}) was added.`, severity: "info", link: "/employees" });

    return mapped;
  }, [supabase, nextEmpNumber, company.id]);

  const updateEmployee = useCallback(async (id: string, data: Partial<Employee>) => {
    blockIfDemo(company.isDemo, "edit_employee");
    const prev = allEmployees.find((e) => e.id === id);
    const baseUpdate = {
      ...(data.firstName      !== undefined && { first_name:      data.firstName      }),
      ...(data.lastName       !== undefined && { last_name:       data.lastName       }),
      ...(data.jobTitle       !== undefined && { job_title:       data.jobTitle       }),
      ...(data.department     !== undefined && { department:      data.department     }),
      ...(data.email          !== undefined && { email:           data.email          }),
      ...(data.phone          !== undefined && { phone:           data.phone          }),
      ...(data.county         !== undefined && { county:          data.county         }),
      ...(data.startDate      !== undefined && { start_date:      data.startDate || null }),
      ...(data.employmentType !== undefined && { employment_type: data.employmentType }),
      ...(data.currency       !== undefined && { currency:        data.currency       }),
      ...(data.rate           !== undefined && { rate:            data.rate           }),
      ...(data.standardHours  !== undefined && { standard_hours:  data.standardHours  }),
      ...(data.allowances     !== undefined && { allowances:      data.allowances     }),
      ...(data.nasscorpNumber !== undefined && { nasscorp_number: data.nasscorpNumber }),
      ...(data.paymentMethod  !== undefined && { payment_method:  data.paymentMethod  }),
      ...(data.bankName       !== undefined && { bank_name:       data.bankName       }),
      ...(data.accountNumber  !== undefined && { account_number:  data.accountNumber  }),
      ...(data.momoNumber          !== undefined && { momo_number:           data.momoNumber          }),
      ...(data.isActive            !== undefined && { is_active:             data.isActive            }),
      ...(data.pendingRegularHours  !== undefined && { pending_regular_hours:  data.pendingRegularHours  }),
      ...(data.pendingOvertimeHours !== undefined && { pending_overtime_hours: data.pendingOvertimeHours }),
      ...(data.pendingHolidayHours  !== undefined && { pending_holiday_hours:  data.pendingHolidayHours  }),
      ...(data.pendingDeductions    !== undefined && { pending_deductions:     data.pendingDeductions    }),
    };
    const extended = {
      ...(data.branch           !== undefined && { branch:            data.branch           }),
      ...(data.position         !== undefined && { position:          data.position         }),
      ...(data.taxId            !== undefined && { tax_id:            data.taxId            }),
      ...(data.employmentStatus !== undefined && { employment_status: data.employmentStatus }),
      ...(data.bankBranch       !== undefined && { bank_branch:       data.bankBranch       }),
      ...(data.dateTerminated   !== undefined && { date_terminated:   data.dateTerminated || null }),
    };

    let res = await db(supabase).from("employees").update({ ...baseUpdate, ...extended }).eq("id", id).select().single();
    if (res.error && Object.keys(extended).length > 0) {
      res = await db(supabase).from("employees").update(baseUpdate).eq("id", id).select().single();
    }
    const row = res.data;
    if (row) setAllEmployees((list) => list.map((e) => e.id === id ? dbToEmployee(row as DbEmployee) : e));

    if (company.id) {
      // Salary-history trail when the pay rate changes.
      if (prev && data.rate !== undefined && Number(data.rate) !== Number(prev.rate)) {
        db(supabase).from("employee_salary_history").insert({
          company_id: company.id,
          employee_id: id,
          currency: data.currency ?? prev.currency,
          old_rate: prev.rate,
          new_rate: data.rate,
          effective_date: new Date().toISOString().split("T")[0],
        }).then(({ error }: { error: unknown }) => { if (error) console.warn("[salary_history] skipped"); });
        logAudit({ companyId: company.id, action: "employee.salary_change", entityType: "employee", entityId: id, oldValue: { rate: prev.rate }, newValue: { rate: data.rate } });
      }
      logAudit({ companyId: company.id, action: "employee.update", entityType: "employee", entityId: id, newValue: data });
    }
  }, [supabase, allEmployees, company.id]);

  const archiveEmployee = useCallback(async (id: string) => {
    blockIfDemo(company.isDemo, "delete_employee");
    if (!id || !company.id) throw new Error("Company not loaded");
    await db(supabase)
      .from("employees")
      .update({ is_archived: true, is_active: false })
      .eq("id", id)
      .eq("company_id", company.id);
    setAllEmployees((prev) =>
      prev.map((e) => e.id === id ? { ...e, isArchived: true, isActive: false } : e)
    );
    logAudit({ companyId: company.id, action: "employee.archive", entityType: "employee", entityId: id });
  }, [supabase, company.id]);

  const restoreEmployee = useCallback(async (id: string) => {
    blockIfDemo(company.isDemo, "edit_employee");
    if (!id || !company.id) throw new Error("Company not loaded");
    await db(supabase)
      .from("employees")
      .update({ is_archived: false, is_active: true })
      .eq("id", id)
      .eq("company_id", company.id);
    setAllEmployees((prev) =>
      prev.map((e) => e.id === id ? { ...e, isArchived: false, isActive: true } : e)
    );
    logAudit({ companyId: company.id, action: "employee.restore", entityType: "employee", entityId: id });
  }, [supabase, company.id]);

  const hardDeleteEmployee = useCallback(async (id: string) => {
    blockIfDemo(company.isDemo, "delete_employee");
    if (!id || !company.id) throw new Error("Company not loaded");
    await db(supabase)
      .from("employees")
      .delete()
      .eq("id", id)
      .eq("company_id", company.id);
    setAllEmployees((prev) => prev.filter((e) => e.id !== id));
    logAudit({ companyId: company.id, action: "employee.delete", entityType: "employee", entityId: id });
  }, [supabase, company.id]);

  const refreshEmployees = useCallback(async () => {
    const { data: emps } = await db(supabase).from("employees").select("*").order("employee_number");
    if (emps) setAllEmployees((emps as DbEmployee[]).map(dbToEmployee));
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
  }, [supabase]);

  const setEmployees: React.Dispatch<React.SetStateAction<Employee[]>> = useCallback((action) => {
    setAllEmployees((prev) => {
      const archived = prev.filter((e) =>  e.isArchived);
      const active   = prev.filter((e) => !e.isArchived);
      const next = typeof action === "function" ? action(active) : action;
      return [...archived, ...next];
    });
  }, []);
  
const refreshCompany = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    const { data: companies } = await db(supabase)
      .from("companies")
      .select("*")
      .eq("owner_id", currentUser.id)
      .order("created_at", { ascending: false });
    const co = companies?.[0] ?? null;
    if (co) setCompanyState(dbToCompany(co as DbCompany));
  }, [supabase]);

  return (
    <AppContext.Provider value={{
      user,
      role,
      loading,
      initializing: loading,
      company, setCompany,
      employees, archivedEmployees,
      addEmployee, refreshEmployees, updateEmployee,
      archiveEmployee, restoreEmployee, hardDeleteEmployee,
      setEmployees, signOut,
      refreshCompany,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}