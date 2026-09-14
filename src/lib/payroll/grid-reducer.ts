import { calculatePayroll } from "@/lib/slipdesk-payroll-engine";
import type { PayRunLine } from "@/lib/mock-data";

export type GridAction =
  | { type: "UPDATE_FIELD"; id: string; field: keyof PayRunLine; value: number }
  | { type: "IMPORT_ROWS"; rows: PayRunLine[] }
  | { type: "SET_ROWS"; rows: PayRunLine[] }
  | { type: "DELETE_ROW"; id: string }
  | { type: "CLEAR" };

export function recalcLine(line: PayRunLine): PayRunLine {
  try {
    const calc = calculatePayroll({
      employeeId: line.employeeId,
      currency: line.currency,
      rate: line.rate,
      regularHours: line.regularHours,
      overtimeHours: line.overtimeHours,
      holidayHours: line.holidayHours,
      exchangeRate: line.exchangeRate,
      additionalEarnings: line.additionalEarnings,
    });
    const ded = line.deductions ?? 0;
    if (ded > 0) {
      return {
        ...line,
        calc: {
          ...calc,
          netPay: Math.max(0, calc.netPay - ded),
          totalDeductions: calc.totalDeductions + ded,
        },
      };
    }
    return { ...line, calc };
  } catch {
    return { ...line, calc: null };
  }
}

export function gridReducer(state: PayRunLine[], action: GridAction): PayRunLine[] {
  switch (action.type) {
    case "UPDATE_FIELD":
      return state.map((l) =>
        l.id !== action.id ? l : recalcLine({ ...l, [action.field]: action.value }),
      );
    case "IMPORT_ROWS":
      return [...state, ...action.rows.map(recalcLine)];
    case "SET_ROWS":
      return action.rows.map(recalcLine);
    case "DELETE_ROW":
      return state.filter((l) => l.id !== action.id);
    case "CLEAR":
      return [];
    default:
      return state;
  }
}
