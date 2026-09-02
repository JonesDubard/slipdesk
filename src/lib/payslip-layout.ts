import type { PayRunLine } from "@/lib/mock-data";

/**
 * Rough vertical layout units for the current A4 payslip template.
 * Used to guard against multi-page overflow without rendering PDF in tests.
 */
export function estimatePayslipLayoutUnits(line: PayRunLine): number {
  const dedItems = line.deductionItems?.length ?? 0;
  const otherDed = dedItems > 0 ? dedItems : line.deductions && line.deductions > 0 ? 1 : 0;
  const earnings =
    1 +
    (line.overtimeHours > 0 ? 1 : 0) +
    (line.holidayHours > 0 ? 1 : 0) +
    ((line.additionalEarnings ?? 0) > 0 ? 1 : 0);
  const deductions = 2 + otherDed; // NASSCORP + PAYE + manual items
  const fixed = 28; // header, info grid, employer box, net, signatures, footer
  const nameExtra = line.fullName.length > 40 ? 2 : 0;
  const paymentExtra = line.paymentMethod && line.paymentMethod !== "cash" ? 2 : 0;
  return fixed + earnings + deductions + nameExtra + paymentExtra;
}

/** Calibrated ceiling for single-page A4 at current font sizes/margins. */
export const PAYSLIP_ONE_PAGE_MAX_UNITS = 52;
