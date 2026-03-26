"use client";

/**
 * Slipdesk — App Context (Supabase-backed)
 * Place at: src/context/AppContext.tsx
 *
 * NOTE ON THE `(supabase as any)` CALLS:
 * Supabase's PostgREST client uses a complex generic chain. When the Database
 * type isn't threaded through correctly (e.g. old client.ts on disk, version
 * mismatch, or Turbopack caching), TypeScript resolves table types as `never`.
 * Casting to `any` at the Supabase call site is the standard workaround — it
 * has zero runtime cost and doesn't affect RLS or type safety elsewhere in the app.
 * Once you've confirmed everything works, you can remove the casts and regenerate
 * types with: npx supabase gen types typescript --project-id YOUR_ID
 */

import {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, type ReactNode,
} from "react";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { DbEmployee, DbCompany } from "@/lib/supabase/types";

// ─── UI Types ─────────────────────────────────────────────────────────────────

export type Currency       = "USD" | "LRD";
export type EmploymentType = "full_time" | "part_time" | "contractor" | "casual";
export type PaymentMethod  = "bank_transfer" | "mtn_momo" | "orange_money" | "cash";

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
}

export interface CompanyProfile {
  id:            string;
  name:          string;
  tin:           string;
  nasscorpRegNo: string;
  address:       string;
  phone:         string;
  email:         string;
  logoUrl:       string | null;
  billingBypass: boolean;
}

export const EMPTY_COMPANY: CompanyProfile = {
  id: "", name: "", tin: "", nasscorpRegNo: "",
  address: "", phone: "", email: "", logoUrl: null, billingBypass: false,
};

// ─── DB ↔ UI converters ───────────────────────────────────────────────────────

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
  };
}

function dbToCompany(row: DbCompany): CompanyProfile {
  return {
    id:            row.id,
    name:          row.name,
    tin:           row.tin,
    nasscorpRegNo: row.nasscorp_reg_no,
    address:       row.address,
    phone:         row.phone,
    email:         row.email,
    logoUrl:       row.logo_url,
    billingBypass: row.billing_bypass ?? false,
  };
}

// ─── Context Shape ────────────────────────────────────────────────────────────

interface AppState {
  user:    User | null;
  loading: boolean;

  company:    CompanyProfile;
  setCompany: (profile: Partial<CompanyProfile>) => Promise<void>;

  employees:          Employee[];
  archivedEmployees:  Employee[];
  addEmployee:        (data: Omit<Employee, "id" | "fullName" | "isArchived">) => Promise<void>;
  updateEmployee:     (id: string, data: Partial<Employee>) => Promise<void>;
  archiveEmployee:    (id: string) => Promise<void>;
  restoreEmployee:    (id: string) => Promise<void>;
  hardDeleteEmployee: (id: string) => Promise<void>;

  /** Legacy shim — local state only. Migrate callers to addEmployee(). */
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;

  signOut: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

// ─── Supabase call helper — bypasses `never` inference entirely ───────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(supabase: ReturnType<typeof createClient>): any {
  return supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const supabase = sbRef.current;

  const [user,         setUser]         = useState<User | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [company,      setCompanyState] = useState<CompanyProfile>(EMPTY_COMPANY);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);

  // ── Boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function boot() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(currentUser);
      if (currentUser) await loadData();
      setLoading(false);
    }

    boot();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadData();
        } else {
          setCompanyState(EMPTY_COMPANY);
          setAllEmployees([]);
        }
      },
    );

    return () => { mounted = false; subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData(retries = 3) {
  const [{ data: companies }, { data: emps }] = await Promise.all([
    db(supabase).from("companies").select("*").order("created_at", { ascending: false }),
    db(supabase).from("employees").select("*").order("employee_number"),
  ]);

  // Pick the company with a name, fallback to most recent
  const co = (companies as any[])?.find((c: any) => c.name) ?? companies?.[0] ?? null;

  if (!co && retries > 0) {
    await new Promise((r) => setTimeout(r, 800));
    return loadData(retries - 1);
  }

  if (co)   setCompanyState(dbToCompany(co as DbCompany));
  if (emps) setAllEmployees((emps as DbEmployee[]).map(dbToEmployee));
}

  // ── Derived slices ───────────────────────────────────────────────────────
  const employees:         Employee[] = allEmployees.filter((e) => !e.isArchived);
  const archivedEmployees: Employee[] = allEmployees.filter((e) =>  e.isArchived);

  // ── Company update ───────────────────────────────────────────────────────
  const setCompany = useCallback(async (profile: Partial<CompanyProfile>) => {
    const payload = {
      ...(profile.name          !== undefined && { name:            profile.name          }),
      ...(profile.tin           !== undefined && { tin:             profile.tin           }),
      ...(profile.nasscorpRegNo !== undefined && { nasscorp_reg_no: profile.nasscorpRegNo }),
      ...(profile.address       !== undefined && { address:         profile.address       }),
      ...(profile.phone         !== undefined && { phone:           profile.phone         }),
      ...(profile.email         !== undefined && { email:           profile.email         }),
      ...(profile.logoUrl       !== undefined && { logo_url:        profile.logoUrl       }),
    };

    if (company.id) {
      // Normal update — company row already exists
      await db(supabase).from("companies").update(payload).eq("id", company.id);
      const { data } = await db(supabase).from("companies").select("*").eq("id", company.id).single();
      if (data) setCompanyState(dbToCompany(data as DbCompany));
    } else {
      // Fallback — trigger didn't create the row yet, create it now
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await db(supabase).from("companies").upsert({
        owner_id: user.id,
        email: user.email ?? "",
        ...payload,
      });
      await loadData();
    }
  }, [company.id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Employee number generator ────────────────────────────────────────────
  const nextEmpNumber = useCallback(() => {
    const nums = allEmployees
      .map((e) => parseInt(e.employeeNumber.replace(/\D/g, ""), 10))
      .filter(Boolean);
    return `EMP-${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
  }, [allEmployees]);

  // ── Add employee ─────────────────────────────────────────────────────────
  const addEmployee = useCallback(async (data: Omit<Employee, "id" | "fullName" | "isArchived">) => {
    const { data: co } = await db(supabase).from("companies").select("id").single();
    if (!co) return;

    const { data: row } = await db(supabase)
      .from("employees")
      .upsert({
        company_id:      co.id,
        employee_number: data.employeeNumber || nextEmpNumber(),
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
      },{ onConflict: "company_id,employee_number" })
      .select()
      .single();

    if (row) setAllEmployees((prev) => [...prev, dbToEmployee(row as DbEmployee)]);
  }, [supabase, nextEmpNumber]);

  // ── Update employee ──────────────────────────────────────────────────────
  const updateEmployee = useCallback(async (id: string, data: Partial<Employee>) => {
    const { data: row } = await db(supabase)
      .from("employees")
      .update({
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
        ...(data.momoNumber     !== undefined && { momo_number:     data.momoNumber     }),
        ...(data.isActive       !== undefined && { is_active:       data.isActive       }),
      })
      .eq("id", id)
      .select()
      .single();

    if (row) setAllEmployees((prev) =>
      prev.map((e) => e.id === id ? dbToEmployee(row as DbEmployee) : e),
    );
  }, [supabase]);

  // ── Archive / Restore / Delete ───────────────────────────────────────────
 const archiveEmployee = useCallback(async (id: string) => {
  if (!id) return; // guard against undefined
  const { data: co } = await db(supabase).from("companies").select("id").single();
  if (!co) return;
  await db(supabase).from("employees")
    .update({ is_archived: true, is_active: false })
    .eq("id", id)
    .eq("company_id", co.id); // ← double lock
  setAllEmployees((prev) =>
    prev.map((e) => e.id === id ? { ...e, isArchived: true, isActive: false } : e),
  );
}, [supabase]);

const restoreEmployee = useCallback(async (id: string) => {
  if (!id) return;
  const { data: co } = await db(supabase).from("companies").select("id").single();
  if (!co) return;
  await db(supabase).from("employees")
    .update({ is_archived: false, is_active: true })
    .eq("id", id)
    .eq("company_id", co.id);
  setAllEmployees((prev) =>
    prev.map((e) => e.id === id ? { ...e, isArchived: false, isActive: true } : e),
  );
}, [supabase]);

const hardDeleteEmployee = useCallback(async (id: string) => {
  if (!id) return;
  const { data: co } = await db(supabase).from("companies").select("id").single();
  if (!co) return;
  await db(supabase).from("employees")
    .delete()
    .eq("id", id)
    .eq("company_id", co.id);
  setAllEmployees((prev) => prev.filter((e) => e.id !== id));
}, [supabase]);

  // ── Sign out ─────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  // ── Legacy shim ──────────────────────────────────────────────────────────
  const setEmployees: React.Dispatch<React.SetStateAction<Employee[]>> = useCallback(
    (action) => {
      setAllEmployees((prev) => {
        const archived = prev.filter((e) =>  e.isArchived);
        const active   = prev.filter((e) => !e.isArchived);
        const next     = typeof action === "function" ? action(active) : action;
        return [...archived, ...next];
      });
    }, [],
  );

  return (
    <AppContext.Provider value={{
      user, loading,
      company, setCompany,
      employees, archivedEmployees,
      addEmployee, updateEmployee,
      archiveEmployee, restoreEmployee, hardDeleteEmployee,
      setEmployees, signOut,
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