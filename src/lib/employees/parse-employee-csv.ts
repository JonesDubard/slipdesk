import type { Employee, EmploymentType, PaymentMethod } from "@/context/AppContext";
import { normalizeGender } from "@/lib/employee-gender";
import {
  resolveImportedBranch,
  type RegisteredBranch,
} from "@/lib/org/branch-assignment";
import { parseDeductionItemsFromCsvRecord } from "@/lib/csv/parse-deduction-items";

export const EMPLOYEE_CSV_HEADERS = [
  "employee_number", "first_name", "middle_name", "last_name", "gender", "job_title", "department",
  "branch",
  "email", "phone", "county", "start_date", "employment_type", "currency",
  "rate", "standard_hours", "allowances", "nasscorp_number", "payment_method",
  "bank_name", "account_number", "momo_number", "regular_hours", "overtime_hours",
  "holiday_hours", "ded_pay_advance", "ded_food", "ded_transportation", "ded_loan_repayment", "ded_other",
] as const;

export const EMPLOYEE_CSV_TEMPLATE_FILENAME = "slipdesk-employees-template.csv";

const EXAMPLE_ROWS = [
  "EMP-001,Moses,James,Kollie,male,Operations Manager,Operations,Sinkor,m.kollie@co.lr,+231770000001,Montserrado,2023-01-15,full_time,USD,8.50,173.33,0,NSC-001-2024,bank_transfer,Ecobank Liberia,1234567890,,173.33,0,0,100,30,20,0,0",
  "EMP-002,Fanta,,Kamara,female,Finance Officer,Finance,Paynesville,f.kamara@co.lr,+231770000002,Montserrado,2023-03-01,full_time,LRD,1500,173.33,50000,NSC-002-2024,mtn_momo,,,0770000002,173.33,0,8,0,0,0,250,0",
];

export function buildEmployeeCsvTemplate(): string {
  return [EMPLOYEE_CSV_HEADERS.join(","), ...EXAMPLE_ROWS].join("\n");
}

function parseDateToISO(dateStr: string | undefined): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    if (year.length === 4 && month.length === 2 && day.length === 2) {
      return `${year}-${month}-${day}`;
    }
  }
  const dashParts = dateStr.split("-");
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    const [day, month, year] = dashParts;
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

function csvBranchValue(raw: Record<string, string>): string {
  return (
    raw.branch ||
    raw.branchname ||
    raw.branch_name ||
    ""
  ).trim();
}

export interface ParsedEmployeeCsvRow {
  data: Partial<Employee>;
  errors: string[];
}

export function parseEmployeeCSV(
  text: string,
  registeredBranches: RegisteredBranch[] = [],
): ParsedEmployeeCsvRow[] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "").replace(/^"|"$/g, ""),
  );

  const results: ParsedEmployeeCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const vals: string[] = [];
    let cur = "";
    let inQ = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') {
        if (inQ && line[ci + 1] === '"') { cur += '"'; ci++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        vals.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    vals.push(cur.trim());

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = vals[idx] ?? ""; });

    const errors: string[] = [];
    const firstName = raw.first_name || raw.firstname || "";
    const middleName = raw.middle_name || raw.middlename || "";
    const lastName = raw.last_name || raw.lastname || "";
    const currency = (raw.currency || "USD").toUpperCase();
    const pm = raw.payment_method || raw.paymentmethod || "bank_transfer";

    if (!firstName) errors.push("First name required");
    if (!lastName) errors.push("Last name required");
    if (!raw.currency) errors.push("Currency required");
    if (!raw.rate) errors.push("Rate required");

    const genderParsed = normalizeGender(raw.gender);
    if (genderParsed.error) errors.push(genderParsed.error);

    const resolvedBranch = resolveImportedBranch(csvBranchValue(raw), registeredBranches);
    if (resolvedBranch.status === "unknown") {
      errors.push(resolvedBranch.warning);
    }

    const n = (v: string | undefined) => (v ? parseFloat(v) : null);

    const employeeNumber = (
      raw.employee_number ||
      raw.employeenumber ||
      raw["employee#"] ||
      ""
    ).trim();

    results.push({
      errors,
      data: {
        employeeNumber,
        firstName, middleName, lastName,
        gender: genderParsed.value,
        jobTitle: raw.job_title || "",
        department: raw.department || "Operations",
        branch: resolvedBranch.branchName,
        email: raw.email || "",
        phone: raw.phone || "",
        county: raw.county || "Montserrado",
        startDate: parseDateToISO(raw.start_date),
        employmentType: (["full_time", "part_time", "contractor", "casual"].includes(raw.employment_type)
          ? raw.employment_type : "full_time") as EmploymentType,
        currency: currency === "LRD" ? "LRD" : "USD",
        rate: isNaN(parseFloat(raw.rate)) ? 0 : parseFloat(raw.rate),
        standardHours: isNaN(parseFloat(raw.standard_hours)) ? 173.33 : parseFloat(raw.standard_hours),
        allowances: isNaN(parseFloat(raw.allowances ?? "0")) ? 0 : parseFloat(raw.allowances ?? "0"),
        nasscorpNumber: raw.nasscorp_number || "",
        paymentMethod: pm as PaymentMethod,
        bankName: raw.bank_name || "",
        accountNumber: raw.account_number || "",
        momoNumber: raw.momo_number || "",
        isActive: true,
        isArchived: false,
        pendingRegularHours: n(raw.regular_hours),
        pendingOvertimeHours: n(raw.overtime_hours),
        pendingHolidayHours: n(raw.holiday_hours),
        pendingDeductions: Object.entries(raw)
          .filter(([key]) => key.startsWith("ded_"))
          .reduce((sum, [, val]) => sum + (parseFloat(val) || 0), 0) ||
          n(raw.deductions) ||
          null,
        pendingDeductionItems: parseDeductionItemsFromCsvRecord(raw).deductionItems,
      },
    });
  }
  return results;
}
