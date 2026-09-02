import type { PayRunLine } from "@/lib/mock-data";
import type { PayRunStatus } from "@/lib/payroll/resolve-payroll-access";

export const DRAFT_PAYLOAD_VERSION = 1;

export type RunType = "monthly" | "weekly" | "bi_weekly" | "bonus" | "off_cycle";

export interface PayRunDraftPayload {
  version: typeof DRAFT_PAYLOAD_VERSION;
  runStarted: boolean;
  lines: PayRunLine[];
}

export interface PayRunDraftSnapshot {
  periodLabel: string;
  payDate: string;
  runType: RunType;
  exchangeRate: number;
  status: PayRunStatus;
  runStarted: boolean;
  lines: PayRunLine[];
}

export function buildDraftPayload(snapshot: PayRunDraftSnapshot): PayRunDraftPayload {
  return {
    version: DRAFT_PAYLOAD_VERSION,
    runStarted: snapshot.runStarted,
    lines: snapshot.lines,
  };
}

export function parseDraftPayload(raw: unknown): PayRunDraftPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== DRAFT_PAYLOAD_VERSION) return null;
  if (!Array.isArray(obj.lines)) return null;
  return {
    version: DRAFT_PAYLOAD_VERSION,
    runStarted: Boolean(obj.runStarted),
    lines: obj.lines as PayRunLine[],
  };
}

export function computeDraftTotals(lines: PayRunLine[], exchangeRate: number) {
  const toUSD = (n: number, ccy: string) => (ccy === "USD" ? n : n / exchangeRate);
  let totalGross = 0;
  let totalNet = 0;
  let totalTax = 0;
  let totalNasscorp = 0;
  let count = 0;

  for (const line of lines) {
    if (!line.calc) continue;
    count += 1;
    totalGross += toUSD(line.calc.grossPay, line.currency);
    totalNet += toUSD(line.calc.netPay, line.currency);
    totalTax += toUSD(line.calc.Paye.taxInBase, line.currency);
    totalNasscorp += toUSD(line.calc.nasscorp.employeeContribution, line.currency);
  }

  return {
    employeeCount: count,
    totalGross: Math.round(totalGross * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    totalIncomeTax: Math.round(totalTax * 100) / 100,
    totalNasscorp: Math.round(totalNasscorp * 100) / 100,
  };
}
