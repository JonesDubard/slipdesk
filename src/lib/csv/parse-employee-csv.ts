import type { Employee, EmploymentType, PaymentMethod } from "@/context/AppContext";
import { normalizeGender } from "@/lib/employee-gender";
import { parseCSVLine, parseDateToISO, splitCsvLines } from "@/lib/csv/parse-csv-line";

export interface ParsedEmployeeRow {
  data: Partial<Employee>;
  errors: string[];
}

export function parseEmployeeCSV(text: string): ParsedEmployeeRow[] {
  const lines = splitCsvLines(text);
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "").replace(/^"|"$/g, "").replace(/_/g, ""),
  );

  const results: ParsedEmployeeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const vals = parseCSVLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = vals[idx] ?? "";
    });

    const errors: string[] = [];
    const firstName = raw.firstname || "";
    const middleName = raw.middlename || "";
    const lastName = raw.lastname || "";
    const currency = (raw.currency || "USD").toUpperCase();
    const pm = raw.paymentmethod || "bank_transfer";

    if (!firstName) errors.push("First name required");
    if (!lastName) errors.push("Last name required");
    if (!raw.currency) errors.push("Currency required");
    if (!raw.rate) errors.push("Rate required");

    const genderParsed = normalizeGender(raw.gender);
    if (genderParsed.error) errors.push(genderParsed.error);

    const n = (v: string | undefined) => (v ? parseFloat(v) : null);

    const employeeNumber = (raw.employeenumber || raw["employee#"] || "").trim();

    const empTypeRaw = raw.employmenttype || "";
    const employmentType = (
      ["full_time", "part_time", "contractor", "casual"].includes(empTypeRaw)
        ? empTypeRaw
        : "full_time"
    ) as EmploymentType;

    results.push({
      errors,
      data: {
        employeeNumber,
        firstName,
        middleName,
        lastName,
        gender: genderParsed.value,
        jobTitle: raw.jobtitle || "",
        department: raw.department || "Operations",
        branch: raw.branch || "",
        email: raw.email || "",
        phone: raw.phone || "",
        county: raw.county || "Montserrado",
        startDate: parseDateToISO(raw.startdate),
        employmentType,
        currency: currency === "LRD" ? "LRD" : "USD",
        rate: Number.isNaN(parseFloat(raw.rate)) ? 0 : parseFloat(raw.rate),
        standardHours: Number.isNaN(parseFloat(raw.standardhours)) ? 173.33 : parseFloat(raw.standardhours),
        allowances: Number.isNaN(parseFloat(raw.allowances ?? "0")) ? 0 : parseFloat(raw.allowances ?? "0"),
        nasscorpNumber: raw.nasscorpnumber || "",
        paymentMethod: pm as PaymentMethod,
        bankName: raw.bankname || "",
        accountNumber: raw.accountnumber || "",
        momoNumber: raw.momonumber || "",
        isActive: true,
        isArchived: false,
        pendingRegularHours: n(raw.regularhours),
        pendingOvertimeHours: n(raw.overtimehours),
        pendingHolidayHours: n(raw.holidayhours),
        pendingDeductions:
          Object.entries(raw)
            .filter(([key]) => key.startsWith("ded"))
            .reduce((sum, [, val]) => sum + (parseFloat(val) || 0), 0) ||
          n(raw.deductions) ||
          null,
      },
    });
  }
  return results;
}
