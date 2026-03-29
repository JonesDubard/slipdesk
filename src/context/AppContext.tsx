"use client";

/**
 * Slipdesk — App Context (Supabase-backed)
 * Place at: src/context/AppContext.tsx
 *
 * FIX 3 — Dashboard goes white on navigation:
 *
 * Root cause: The component tree mounts fresh on each navigation in Next.js
 * App Router. `booted` and `dataLoading` both start as false/false so
 * `loading = !booted || dataLoading = true` immediately — correct. But the
 * old code also re-ran loadData() on every TOKEN_REFRESHED auth event,
 * which flipped `dataLoading` back to true even mid-session, causing
 * children that gate on `!loading` to unmount (white screen).
 *
 * The fix (already partially in place) is:
 *  a) Never trigger loadData() on TOKEN_REFRESHED — only on SIGNED_IN / USER_UPDATED.
 *  b) Expose a separate `initializing` flag for the very first mount so
 *     the layout can show a skeleton instead of rendering nothing.
 *  c) Children that use `loading` to gate their render should use
 *     `initializing` instead, so mid-session token refreshes don't blank the page.
 */

import {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, type ReactNode,
} from "react";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { DbEmployee, DbCompany } from "@/lib/supabase/types";

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
  id:"", name:"", tin:"", nasscorpRegNo:"",
  address:"", phone:"", email:"", logoUrl:null, billingBypass:false,
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

interface AppState {
  user:         User | null;
  /** True only during initial page boot — use this to show skeleton screens.
   *  Does NOT flip true again on mid-session token refreshes. */
  loading:      boolean;
  /** Alias for loading — kept for backward compatibility. */
  initializing: boolean;
  company:    CompanyProfile;
  setCompany: (profile: Partial<CompanyProfile>) => Promise<void>;
  employees:          Employee[];
  archivedEmployees:  Employee[];
  addEmployee:        (data: Omit<Employee, "id" | "fullName" | "isArchived">) => Promise<Employee | null>;
  refreshEmployees:   () => Promise<void>;
  updateEmployee:     (id: string, data: Partial<Employee>) => Promise<void>;
  archiveEmployee:    (id: string) => Promise<void>;
  restoreEmployee:    (id: string) => Promise<void>;
  hardDeleteEmployee: (id: string) => Promise<void>;
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(supabase: ReturnType<typeof createClient>): any { return supabase as any; }

// ─── Module-level boot flag ───────────────────────────────────────────────────
// Using a module-level variable (not React state) means this survives
// Next.js App Router navigations, which remount the component tree but do NOT
// reload the JS module. Without this, `booted` reset to false on every page
// navigation → every page went white until Supabase responded again.
let _hasBooted = false;

export function AppProvider({ children }: { children: ReactNode }) {
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const supabase = sbRef.current;

  const [user,         setUser]         = useState<User | null>(null);
  // Initialise from the module flag so navigating back to a page never
  // shows a white screen — if we've already booted once, start as true.
  const [booted,       setBooted]       = useState(_hasBooted);
  const [dataLoading,  setDataLoading]  = useState(false);
  const [company,      setCompanyState] = useState<CompanyProfile>(EMPTY_COMPANY);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);

  // `loading` is true only on the very first boot across the entire session.
  // TOKEN_REFRESHED events and page navigations do NOT flip it back to true.
  const loading = !booted;

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const { data:{ user:currentUser } } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(currentUser);
      if (currentUser) {
        setDataLoading(true);
        await loadData();
        if (mounted) setDataLoading(false);
      }
      // Flip both the module-level flag and React state. The module flag
      // persists across navigations; the React state drives re-renders.
      if (mounted) { _hasBooted = true; setBooted(true); }
    }

    boot();

    const { data:{ subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        const newUser = session?.user ?? null;
        setUser(newUser);

        if (newUser) {
          // FIX 3: only reload data on meaningful sign-in events.
          // TOKEN_REFRESHED fires silently every ~60 mins and must NOT
          // trigger a data reload — that was causing the dashboard to
          // go white every hour.
          if (event === "SIGNED_IN" || event === "USER_UPDATED") {
            setDataLoading(true);
            await loadData();
            if (mounted) setDataLoading(false);
          }
          // TOKEN_REFRESHED: do nothing — the session is still valid,
          // the data is still in state, no reload needed.
        } else {
          // Signed out — clear everything
          setCompanyState(EMPTY_COMPANY);
          setAllEmployees([]);
          // Note: booted stays true so a sign-out doesn't blank the page
        }
      },
    );

    return () => { mounted = false; subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData(retries = 3) {
    const [{ data:companies }, { data:emps }] = await Promise.all([
      db(supabase).from("companies").select("*").order("created_at", { ascending:false }),
      db(supabase).from("employees").select("*").order("employee_number"),
    ]);
    const co = (companies as any[])?.find((c: any) => c.name) ?? companies?.[0] ?? null;
    if (!co && retries > 0) {
      await new Promise((r) => setTimeout(r, 800));
      return loadData(retries - 1);
    }
    if (co)   setCompanyState(dbToCompany(co as DbCompany));
    if (emps) setAllEmployees((emps as DbEmployee[]).map(dbToEmployee));
  }

  const employees:         Employee[] = allEmployees.filter((e) => !e.isArchived);
  const archivedEmployees: Employee[] = allEmployees.filter((e) =>  e.isArchived);

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
      await db(supabase).from("companies").update(payload).eq("id", company.id);
      const { data } = await db(supabase).from("companies").select("*").eq("id", company.id).single();
      if (data) setCompanyState(dbToCompany(data as DbCompany));
    } else {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      await db(supabase).from("companies").upsert({ owner_id:user.id, email:user.email ?? "", ...payload });
      await loadData();
    }
  }, [company.id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextEmpNumber = useCallback(() => {
    const nums = allEmployees.map((e) => parseInt(e.employeeNumber.replace(/\D/g,""), 10)).filter(Boolean);
    return `EMP-${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
  }, [allEmployees]);

  const addEmployee = useCallback(async (
    data: Omit<Employee, "id" | "fullName" | "isArchived">,
  ): Promise<Employee | null> => {
    const { data:co } = await db(supabase).from("companies").select("id").single();
    if (!co) return null;
    const { data:row } = await db(supabase).from("employees").upsert({
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
    }, { onConflict:"company_id,employee_number" }).select().single();

    if (!row) return null;

    const mapped = dbToEmployee(row as DbEmployee);
    setAllEmployees((prev) => {
      const exists = prev.some((e) => e.id === mapped.id);
      return exists ? prev.map((e) => e.id === mapped.id ? mapped : e) : [...prev, mapped];
    });
    // Return the fully-mapped employee so callers get the real Supabase UUID
    return mapped;
  }, [supabase, nextEmpNumber]);

  const updateEmployee = useCallback(async (id: string, data: Partial<Employee>) => {
    const { data:row } = await db(supabase).from("employees").update({
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
    }).eq("id", id).select().single();
    if (row) setAllEmployees((prev) => prev.map((e) => e.id === id ? dbToEmployee(row as DbEmployee) : e));
  }, [supabase]);

  const archiveEmployee = useCallback(async (id: string) => {
    if (!id) return;
    const { data:co } = await db(supabase).from("companies").select("id").single();
    if (!co) return;
    await db(supabase).from("employees").update({ is_archived:true, is_active:false }).eq("id",id).eq("company_id",co.id);
    setAllEmployees((prev) => prev.map((e) => e.id === id ? { ...e, isArchived:true, isActive:false } : e));
  }, [supabase]);

  const restoreEmployee = useCallback(async (id: string) => {
    if (!id) return;
    const { data:co } = await db(supabase).from("companies").select("id").single();
    if (!co) return;
    await db(supabase).from("employees").update({ is_archived:false, is_active:true }).eq("id",id).eq("company_id",co.id);
    setAllEmployees((prev) => prev.map((e) => e.id === id ? { ...e, isArchived:false, isActive:true } : e));
  }, [supabase]);

  const hardDeleteEmployee = useCallback(async (id: string) => {
    if (!id) return;
    const { data:co } = await db(supabase).from("companies").select("id").single();
    if (!co) return;
    await db(supabase).from("employees").delete().eq("id",id).eq("company_id",co.id);
    setAllEmployees((prev) => prev.filter((e) => e.id !== id));
  }, [supabase]);

  // Reload employees from Supabase — used after bulk import to ensure
  // all concurrently-saved employees are reflected in state accurately.
  const refreshEmployees = useCallback(async () => {
    const { data: emps } = await db(supabase).from("employees").select("*").order("employee_number");
    if (emps) setAllEmployees((emps as DbEmployee[]).map(dbToEmployee));
  }, [supabase]);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, [supabase]);

  const setEmployees: React.Dispatch<React.SetStateAction<Employee[]>> = useCallback((action) => {
    setAllEmployees((prev) => {
      const archived = prev.filter((e) =>  e.isArchived);
      const active   = prev.filter((e) => !e.isArchived);
      const next = typeof action === "function" ? action(active) : action;
      return [...archived, ...next];
    });
  }, []);

  return (
    <AppContext.Provider value={{
      user,
      loading,
      initializing: loading,   // alias — both refer to first-boot loading only
      company, setCompany,
      employees, archivedEmployees,
      addEmployee, refreshEmployees, updateEmployee,
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