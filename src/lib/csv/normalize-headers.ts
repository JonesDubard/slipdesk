/** Compact form for alias lookup: lowercase, no spaces/underscores/hyphens. */
export function compactHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^["']+|["']+$/g, "")
    .replace(/[\s_\-#.]+/g, "");
}

const HEADER_ALIASES: Record<string, string> = {
  employeenumber: "employee_number",
  employeeid: "employee_number",
  empno: "employee_number",
  empid: "employee_number",
  staffid: "employee_number",
  staffno: "employee_number",
  staffnumber: "employee_number",
  firstname: "first_name",
  first: "first_name",
  givenname: "first_name",
  middlename: "middle_name",
  middle: "middle_name",
  lastname: "last_name",
  last: "last_name",
  surname: "last_name",
  familyname: "last_name",
  name: "name",
  fullname: "name",
  employeename: "name",
  staffname: "name",
  gender: "gender",
  sex: "gender",
  jobtitle: "job_title",
  job: "job_title",
  title: "job_title",
  position: "job_title",
  department: "department",
  dept: "department",
  branch: "branch",
  site: "branch",
  location: "branch",
  email: "email",
  emailaddress: "email",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  tel: "phone",
  county: "county",
  startdate: "start_date",
  datehired: "start_date",
  hiredate: "start_date",
  employmenttype: "employment_type",
  emptype: "employment_type",
  type: "employment_type",
  currency: "currency",
  ccy: "currency",
  rate: "rate",
  hourlyrate: "rate",
  payrate: "rate",
  salary: "rate",
  wage: "rate",
  standardhours: "standard_hours",
  hours: "standard_hours",
  allowances: "allowances",
  nasscorpnumber: "nasscorp_number",
  nasscorp: "nasscorp_number",
  nsc: "nasscorp_number",
  paymentmethod: "payment_method",
  paymethod: "payment_method",
  bankname: "bank_name",
  bank: "bank_name",
  accountnumber: "account_number",
  account: "account_number",
  momonumber: "momo_number",
  momo: "momo_number",
  regularhours: "regular_hours",
  overtimehours: "overtime_hours",
  ot: "overtime_hours",
  holidayhours: "holiday_hours",
  deductions: "deductions",
};

const HEADER_HINTS = new Set([
  "employee_number",
  "first_name",
  "last_name",
  "name",
  "rate",
  "department",
  "payment_method",
  "currency",
]);

export function canonicalHeader(raw: string): string {
  const compact = compactHeader(raw);
  if (!compact) return "";
  if (HEADER_ALIASES[compact]) return HEADER_ALIASES[compact];
  const snake = raw
    .trim()
    .toLowerCase()
    .replace(/^["']+|["']+$/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (snake.startsWith("ded_")) return snake;
  return snake || compact;
}

export function isLikelyHeaderRow(cells: string[]): boolean {
  const mapped = cells.map(canonicalHeader).filter(Boolean);
  return mapped.some((h) => HEADER_HINTS.has(h));
}

export function splitFullName(name: string): { firstName: string; middleName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

export function rowToRecord(headers: string[], values: string[]): Record<string, string> {
  const raw: Record<string, string> = {};
  headers.forEach((h, idx) => {
    if (!h) return;
    const val = values[idx] ?? "";
    if (raw[h] === undefined || raw[h] === "") raw[h] = val;
  });
  if ((!raw.first_name || !raw.last_name) && raw.name) {
    const split = splitFullName(raw.name);
    if (!raw.first_name) raw.first_name = split.firstName;
    if (!raw.middle_name) raw.middle_name = split.middleName;
    if (!raw.last_name) raw.last_name = split.lastName;
  }
  return raw;
}
