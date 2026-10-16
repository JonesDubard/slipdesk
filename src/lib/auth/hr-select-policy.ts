/**
 * Boolean form of the 0025 SELECT policies.
 * Staff reads require is_company_staff() and company_id = my_company_id().
 * An employee reads only rows for my_employee_id(), or leave policies for that
 * employee's own company. A portal user does not see every company's policies.
 */

export function staffCanReadCompanyRow(
  isStaff: boolean,
  rowCompanyId: string,
  myCompanyId: string | null,
): boolean {
  return isStaff && Boolean(myCompanyId) && rowCompanyId === myCompanyId;
}

export function employeeCanReadOwnRow(
  rowEmployeeId: string,
  myEmployeeId: string | null,
): boolean {
  return Boolean(myEmployeeId) && rowEmployeeId === myEmployeeId;
}

/** leave_requests, attendance, overtime, balances, ledger, weekly OT, notification prefs. */
export function employeeOrStaffCanRead(opts: {
  isStaff: boolean;
  rowCompanyId: string;
  myCompanyId: string | null;
  rowEmployeeId: string;
  myEmployeeId: string | null;
}): boolean {
  return (
    employeeCanReadOwnRow(opts.rowEmployeeId, opts.myEmployeeId) ||
    staffCanReadCompanyRow(opts.isStaff, opts.rowCompanyId, opts.myCompanyId)
  );
}

/** leave_policies: no employee_id column. Scope by the employee's company, not "any portal user". */
export function leavePolicyVisible(opts: {
  isStaff: boolean;
  rowCompanyId: string;
  myCompanyId: string | null;
  employeeCompanyId: string | null;
}): boolean {
  return (
    staffCanReadCompanyRow(opts.isStaff, opts.rowCompanyId, opts.myCompanyId) ||
    Boolean(opts.employeeCompanyId) && opts.rowCompanyId === opts.employeeCompanyId
  );
}
