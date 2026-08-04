/**
 * Authorization helpers for the employee self-service portal.
 * Every data path must resolve the caller's linked employee and scope queries to it.
 */

export type LinkedEmployee = {
  id: string;
  companyId: string;
  userId: string;
  employeeNumber: string;
  fullName: string;
  firstName: string;
  lastName: string;
  phone: string;
  phoneE164: string | null;
  email: string;
  address: string;
  county: string;
  jobTitle: string;
  department: string;
  paymentMethod: string;
  bankName: string;
  accountNumber: string;
  bankBranch: string;
  momoNumber: string;
  nasscorpNumber: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export function mapEmployeeRow(row: Record<string, unknown>): LinkedEmployee {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    userId: String(row.user_id ?? ""),
    employeeNumber: String(row.employee_number ?? ""),
    fullName: String(row.full_name ?? ""),
    firstName: String(row.first_name ?? ""),
    lastName: String(row.last_name ?? ""),
    phone: String(row.phone ?? ""),
    phoneE164: row.phone_e164 ? String(row.phone_e164) : null,
    email: String(row.email ?? ""),
    address: String(row.address ?? ""),
    county: String(row.county ?? ""),
    jobTitle: String(row.job_title ?? ""),
    department: String(row.department ?? ""),
    paymentMethod: String(row.payment_method ?? ""),
    bankName: String(row.bank_name ?? ""),
    accountNumber: String(row.account_number ?? ""),
    bankBranch: String(row.bank_branch ?? ""),
    momoNumber: String(row.momo_number ?? ""),
    nasscorpNumber: String(row.nasscorp_number ?? ""),
  };
}

/**
 * Resolve the employee row linked to an auth user.
 * Returns null when the user is not an employee-portal principal.
 */
export async function resolveLinkedEmployee(
  client: AnyClient,
  userId: string,
): Promise<LinkedEmployee | null> {
  if (!userId) return null;
  const { data, error } = await client
    .from("employees")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapEmployeeRow(data as Record<string, unknown>);
}

/**
 * Hard authorization gate: ensure a requested employeeId matches the caller.
 * Used by every employee-facing API before returning or mutating data.
 */
export function assertOwnEmployee(
  linked: LinkedEmployee | null,
  requestedEmployeeId?: string | null,
): { ok: true; employee: LinkedEmployee } | { ok: false; status: 401 | 403; error: string } {
  if (!linked) {
    return { ok: false, status: 401, error: "Employee portal session required." };
  }
  if (requestedEmployeeId && requestedEmployeeId !== linked.id) {
    return { ok: false, status: 403, error: "Forbidden: cannot access another employee's data." };
  }
  return { ok: true, employee: linked };
}

/**
 * Roles that may review the change-request queue.
 */
export function canReviewChangeRequests(role: string | null | undefined): boolean {
  return (
    role === "company_owner" ||
    role === "hr_manager" ||
    role === "super_admin" ||
    role === "admin" ||
    role === "owner"
  );
}
