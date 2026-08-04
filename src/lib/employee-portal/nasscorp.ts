/**
 * Cumulative NASSCORP contributions from paid pay_run_lines (read-only).
 * Amounts are normalized to USD using each line's exchange_rate
 * (LRD → USD = amount / exchangeRate), matching payroll run totals.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type NasscorpLineDetail = {
  payslipId: string;
  periodLabel: string;
  payDate: string;
  currency: string;
  exchangeRate: number;
  employeeContribution: number;
  employerContribution: number;
  /** Same contributions converted to USD for rollups */
  employeeContributionUsd: number;
  employerContributionUsd: number;
};

export type NasscorpContributionSummary = {
  employeeId: string;
  nasscorpNumber: string;
  /** Totals always in USD */
  employeeContributionTotal: number;
  employerContributionTotal: number;
  combinedTotal: number;
  reportingCurrency: "USD";
  periodsCounted: number;
  currencyNote: string;
  /** Per-currency native totals (not mixed) */
  byCurrency: Array<{
    currency: string;
    employeeContribution: number;
    employerContribution: number;
    periods: number;
  }>;
  lines: NasscorpLineDetail[];
};

/** Convert a line amount to USD. exchangeRate is LRD per 1 USD. */
export function toUsd(
  amount: number,
  currency: string,
  exchangeRate: number,
): number {
  const n = Number(amount) || 0;
  if ((currency || "USD").toUpperCase() === "USD") return n;
  const fx = Number(exchangeRate) || 0;
  if (fx <= 0) return n; // cannot convert — leave as-is but callers should flag
  return n / fx;
}

export function aggregateNasscorpLines(
  lines: Array<{
    id: string;
    pay_run_id: string;
    nasscorp_ee: number;
    nasscorp_er: number;
    currency?: string;
    exchange_rate?: number;
  }>,
  runMap: Map<string, { period_label: string; pay_date: string }>,
): Pick<
  NasscorpContributionSummary,
  | "employeeContributionTotal"
  | "employerContributionTotal"
  | "combinedTotal"
  | "periodsCounted"
  | "byCurrency"
  | "lines"
> {
  let eeUsd = 0;
  let erUsd = 0;
  const byCurrencyMap = new Map<string, { ee: number; er: number; periods: number }>();
  const detail: NasscorpLineDetail[] = [];

  for (const line of lines) {
    const run = runMap.get(line.pay_run_id);
    if (!run) continue;
    const currency = String(line.currency ?? "USD").toUpperCase();
    const fx = Number(line.exchange_rate) || 1;
    const eeAmt = Number(line.nasscorp_ee) || 0;
    const erAmt = Number(line.nasscorp_er) || 0;
    const eeU = toUsd(eeAmt, currency, fx);
    const erU = toUsd(erAmt, currency, fx);
    eeUsd += eeU;
    erUsd += erU;

    const bucket = byCurrencyMap.get(currency) ?? { ee: 0, er: 0, periods: 0 };
    bucket.ee += eeAmt;
    bucket.er += erAmt;
    bucket.periods += 1;
    byCurrencyMap.set(currency, bucket);

    detail.push({
      payslipId: line.id,
      periodLabel: run.period_label,
      payDate: run.pay_date,
      currency,
      exchangeRate: fx,
      employeeContribution: eeAmt,
      employerContribution: erAmt,
      employeeContributionUsd: round2(eeU),
      employerContributionUsd: round2(erU),
    });
  }

  return {
    employeeContributionTotal: round2(eeUsd),
    employerContributionTotal: round2(erUsd),
    combinedTotal: round2(eeUsd + erUsd),
    periodsCounted: detail.length,
    byCurrency: [...byCurrencyMap.entries()].map(([currency, v]) => ({
      currency,
      employeeContribution: round2(v.ee),
      employerContribution: round2(v.er),
      periods: v.periods,
    })),
    lines: detail,
  };
}

export async function getNasscorpContributions(
  client: AnyClient,
  employeeId: string,
  companyId: string,
  nasscorpNumber = "",
): Promise<NasscorpContributionSummary> {
  const empty: NasscorpContributionSummary = {
    employeeId,
    nasscorpNumber,
    employeeContributionTotal: 0,
    employerContributionTotal: 0,
    combinedTotal: 0,
    reportingCurrency: "USD",
    periodsCounted: 0,
    currencyNote:
      "Totals are normalized to USD (LRD ÷ exchange rate). Per-currency native amounts are listed separately.",
    byCurrency: [],
    lines: [],
  };

  if (!employeeId || !companyId) return empty;

  const { data: lines, error } = await client
    .from("pay_run_lines")
    .select("id, pay_run_id, nasscorp_ee, nasscorp_er, currency, exchange_rate, created_at")
    .eq("employee_id", employeeId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error || !lines?.length) return empty;

  const runIds = [...new Set((lines as { pay_run_id: string }[]).map((l) => l.pay_run_id))];
  const { data: runs } = await client
    .from("pay_runs")
    .select("id, period_label, pay_date, status")
    .in("id", runIds)
    .eq("status", "paid");

  const runMap = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((runs ?? []) as any[]).map((r) => [r.id, r]),
  );

  const aggregated = aggregateNasscorpLines(lines as Parameters<typeof aggregateNasscorpLines>[0], runMap);

  return {
    ...empty,
    ...aggregated,
    nasscorpNumber,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
