import {
  currencyTypeId,
  isNineDigitSsNumber,
  isNasscorpPayrollType,
  isSevenDigitEmployerId,
  isUnsupportedNasscorpRunType,
  payPeriodFromRunType,
  type NasscorpPayrollType,
} from "@/lib/compliance/nasscorp/spec";

export type NasscorpIssueSeverity = "error" | "warning";

export interface NasscorpIssue {
  severity: NasscorpIssueSeverity;
  code: string;
  message: string;
}

export interface NasscorpEmployeeInput {
  nassCorpNo: string;
  firstName: string;
  middleName: string;
  lastName: string;
  grossPay: number;
  payrollDate: string;
  runType: string;
  currency: string;
  label: string;
}

export interface NasscorpFilingInput {
  employerId: string;
  employerName: string;
  payrollDate: string;
  payrollType: NasscorpPayrollType;
  employees: NasscorpEmployeeInput[];
}

export interface NasscorpValidationResult {
  ok: boolean;
  errors: NasscorpIssue[];
  warnings: NasscorpIssue[];
}

export function validateNasscorpFiling(input: NasscorpFilingInput): NasscorpValidationResult {
  const errors: NasscorpIssue[] = [];
  const warnings: NasscorpIssue[] = [];

  if (!input.employees.length) {
    errors.push({
      severity: "error",
      code: "no-employees",
      message: "Select a finalized payroll period with employees before generating the NASSCORP file.",
    });
  }

  if (!input.employerName.trim()) {
    errors.push({
      severity: "error",
      code: "employer-name",
      message: "Employer name is missing.",
    });
  }

  if (!isSevenDigitEmployerId(input.employerId)) {
    errors.push({
      severity: "error",
      code: "employer-id",
      message: "NASSCORP Employer ID must be exactly 7 digits (Settings → NASSCORP Employer ID).",
    });
  }

  if (!isIsoDate(input.payrollDate)) {
    errors.push({
      severity: "error",
      code: "employer-pay-date",
      message: "Payroll date is missing or invalid on the selected pay run.",
    });
  }

  if (!isNasscorpPayrollType(input.payrollType)) {
    errors.push({
      severity: "error",
      code: "payroll-type",
      message: "PayrollType must be 1 (NPS + EIS) or 2 (EIS only).",
    });
  }

  const currencies = new Set<string>();
  const ssSeen = new Map<string, string>();

  for (const e of input.employees) {
    const who = e.label || [e.firstName, e.lastName].filter(Boolean).join(" ") || "An employee";

    if (!e.firstName.trim()) {
      errors.push({ severity: "error", code: "first-name", message: `${who} is missing a first name.` });
    }
    if (!e.lastName.trim()) {
      errors.push({ severity: "error", code: "last-name", message: `${who} is missing a last name.` });
    }
    if (!e.middleName.trim()) {
      warnings.push({
        severity: "warning",
        code: "middle-name",
        message: `${who} has no middle name. Leave blank only if that matches NASSCORP Form 2.`,
      });
    }

    if (!isNineDigitSsNumber(e.nassCorpNo)) {
      errors.push({
        severity: "error",
        code: "ss-number",
        message: `${who} needs a 9-digit NASSCORP SS number (NASSCorpNo). Do not use the Slipdesk employee number.`,
      });
    } else {
      const key = e.nassCorpNo.trim();
      if (ssSeen.has(key)) {
        errors.push({
          severity: "error",
          code: "duplicate-ss",
          message: `NASSCorpNo ${key} appears more than once (${ssSeen.get(key)} and ${who}). The official file allows one row per SS number.`,
        });
      } else {
        ssSeen.set(key, who);
      }
    }

    if (!Number.isFinite(e.grossPay) || e.grossPay <= 0) {
      errors.push({
        severity: "error",
        code: "gross-pay",
        message: `${who} has a missing or invalid finalized GrossPay.`,
      });
    }

    if (!isIsoDate(e.payrollDate)) {
      errors.push({
        severity: "error",
        code: "employee-pay-date",
        message: `${who} has a missing or invalid payroll date.`,
      });
    }

    if (isUnsupportedNasscorpRunType(e.runType)) {
      errors.push({
        severity: "error",
        code: "nasscorp-not-applicable",
        message: `${who} is on a ${labelUnsupportedRun(e.runType)} pay run. NASSCORP reporting is not applicable to Bonus or Off-Cycle payrolls. NASSCORP statutory reporting supports Weekly, Bi-Weekly, and Monthly payroll only.`,
      });
    } else if (payPeriodFromRunType(e.runType) == null) {
      errors.push({
        severity: "error",
        code: "unsupported-run-type",
        message: `${who} is on a ${labelUnsupportedRun(e.runType)} pay run. NASSCORP statutory reporting supports Weekly, Bi-Weekly, and Monthly payroll only.`,
      });
    }

    const ccy = currencyTypeId(e.currency);
    if (ccy == null) {
      errors.push({
        severity: "error",
        code: "currency",
        message: `${who} has an unsupported currency "${e.currency}".`,
      });
    } else {
      currencies.add(e.currency.trim().toUpperCase());
    }
  }

  if (currencies.size > 1) {
    errors.push({
      severity: "error",
      code: "mixed-currency",
      message: "This selection mixes USD and LRD. The official workbook allows one CurrencyTypeID. Export one currency at a time.",
    });
  }

  warnings.push({
    severity: "warning",
    code: "form-2-names",
    message: "First, middle, and last names must match the employee’s NASSCORP Form 2 exactly. Slipdesk cannot verify that match.",
  });
  warnings.push({
    severity: "warning",
    code: "not-certified",
    message: "This is the official 2025 spreadsheet format for email submission — not a certified e-filing and not a remittance receipt. Pay 10% of total monthly gross separately.",
  });

  return { ok: errors.length === 0, errors, warnings };
}

function labelUnsupportedRun(runType: string): string {
  if (runType === "bonus") return "Bonus";
  if (runType === "off_cycle") return "Off-Cycle";
  return runType || "unsupported";
}

function isIsoDate(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test((raw ?? "").trim().slice(0, 10));
}
