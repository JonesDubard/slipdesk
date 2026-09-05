import {
  DEFAULT_NASSCORP_PAYROLL_TYPE,
  isNasscorpPayrollType,
  type NasscorpPayrollType,
} from "@/lib/compliance/nasscorp/spec";

const storageKey = (companyId: string) => `slipdesk.nasscorpPayrollType.${companyId || "default"}`;

export function readStoredNasscorpPayrollType(companyId: string): NasscorpPayrollType {
  if (typeof window === "undefined") return DEFAULT_NASSCORP_PAYROLL_TYPE;
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    const n = raw == null ? NaN : Number(raw);
    return isNasscorpPayrollType(n) ? n : DEFAULT_NASSCORP_PAYROLL_TYPE;
  } catch {
    return DEFAULT_NASSCORP_PAYROLL_TYPE;
  }
}

export function storeNasscorpPayrollType(companyId: string, value: NasscorpPayrollType): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(companyId), String(value));
  } catch {
    /* ignore quota / private mode */
  }
}
