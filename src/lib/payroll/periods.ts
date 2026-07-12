/** Payroll period helpers for the Professional Payroll Calendar. */

export type PayFrequency = "monthly" | "bi_weekly" | "weekly";

export interface PayPeriod {
  label: string;
  start: string; // YYYY-MM-DD
  end: string;
  payDate: string;
}

export function getCurrentPeriod(now = new Date()): PayPeriod {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const label = now.toLocaleDateString("en-LR", { year: "numeric", month: "long" });
  return {
    label,
    start: isoDate(start),
    end: isoDate(end),
    payDate: isoDate(end),
  };
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface CalendarDay {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  isPayDate: boolean;
  isPeriodStart: boolean;
  isPeriodEnd: boolean;
  runIds: string[];
}

export interface CalendarMonth {
  year: number;
  month: number; // 1-12
  label: string;
  weeks: CalendarDay[][];
  currentPeriod: PayPeriod;
}

export interface CalendarRunDot {
  id: string;
  payDate?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  status?: string | null;
  periodLabel?: string | null;
}

/** Build a month grid (Sun–Sat) annotated with pay period + pay-run dots. */
export function buildPayrollCalendarMonth(
  year: number,
  month: number,
  runs: CalendarRunDot[],
  today = new Date(),
): CalendarMonth {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const currentPeriod = {
    label: first.toLocaleDateString("en-LR", { year: "numeric", month: "long" }),
    start: isoDate(first),
    end: isoDate(last),
    payDate: isoDate(last),
  };

  const startPad = first.getDay(); // 0=Sun
  const daysInMonth = last.getDate();
  const cells: CalendarDay[] = [];

  const prevLast = new Date(year, month - 1, 0).getDate();
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month - 2, prevLast - i);
    cells.push(dayCell(d, false, currentPeriod, runs, today));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    cells.push(dayCell(d, true, currentPeriod, runs, today));
  }
  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - (startPad + daysInMonth) + 1;
    const d = new Date(year, month, nextDay);
    cells.push(dayCell(d, false, currentPeriod, runs, today));
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    year,
    month,
    label: currentPeriod.label,
    weeks,
    currentPeriod,
  };
}

function dayCell(
  d: Date,
  inMonth: boolean,
  period: PayPeriod,
  runs: CalendarRunDot[],
  today: Date,
): CalendarDay {
  const date = isoDate(d);
  const runIds = runs
    .filter((r) => {
      const pay = r.payDate?.slice(0, 10);
      const start = r.periodStart?.slice(0, 10);
      const end = r.periodEnd?.slice(0, 10);
      return pay === date || start === date || end === date;
    })
    .map((r) => r.id);

  return {
    date,
    inMonth,
    isToday: isoDate(today) === date,
    isPayDate: period.payDate === date,
    isPeriodStart: period.start === date,
    isPeriodEnd: period.end === date,
    runIds,
  };
}
