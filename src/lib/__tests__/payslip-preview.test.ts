import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PayslipPreviewModal } from "@/components/payslip/PayslipPreviewModal";
import type { PayRunLine } from "@/lib/mock-data";

function mockLine(): PayRunLine {
  return {
    id: "line-1",
    employeeId: "emp-1",
    employeeNumber: "E-001",
    fullName: "Ada Johnson",
    jobTitle: "Officer",
    department: "Finance",
    currency: "USD",
    rate: 10,
    regularHours: 160,
    overtimeHours: 0,
    holidayHours: 0,
    additionalEarnings: 0,
    exchangeRate: 190,
    deductions: 0,
    deductionItems: [],
    calc: {
      employeeId: "emp-1",
      currency: "USD",
      exchangeRate: 190,
      regularSalary: 1600,
      overtimePay: 0,
      holidayPay: 0,
      additionalEarnings: 0,
      grossPay: 1600,
      nasscorp: { base: 1600, employeeContribution: 64, employerContribution: 96 },
      Paye: {
        grossInLRD: 0,
        annualGrossInLRD: 0,
        annualTaxInLRD: 0,
        taxInLRD: 0,
        taxInBase: 301.5,
        effectiveRate: 0,
      },
      totalDeductions: 365.5,
      netPay: 1234.5,
      totalEmployerCost: 1696,
      warnings: [],
    },
  };
}

function markup(open: boolean) {
  return renderToStaticMarkup(
    createElement(PayslipPreviewModal, {
      open,
      line: mockLine(),
      periodLabel: "October 2026",
      onClose: () => {},
      onDownloadPdf: () => {},
      downloading: false,
    }),
  );
}

describe("payslip preview modal", () => {
  it("renders no dialog when closed", () => {
    const html = markup(false);
    expect(html).not.toContain('role="dialog"');
  });

  it("opens with the calculated net pay and a Download PDF button", () => {
    const html = markup(true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("1234.50");
    expect(html).toContain("Download PDF");
    expect(html).toContain("This is a preview. The PDF download is the official record.");
  });
});
