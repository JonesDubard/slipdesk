/** Case-insensitive employee number key. Blank numbers never match. */
export function normalizeEmployeeNumber(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function findEmployeeByNumber<T extends { employeeNumber: string }>(
  employees: T[],
  number: string | undefined | null,
): T | undefined {
  const key = normalizeEmployeeNumber(number);
  if (!key) return undefined;
  return employees.find((e) => normalizeEmployeeNumber(e.employeeNumber) === key);
}

export type EmployeeImportAction<T> =
  | { action: "create" }
  | { action: "update"; existing: T };

/** Re-import of an existing employee number is an update, never a skip. Blank numbers always create. */
export function classifyEmployeeImport<T extends { employeeNumber: string }>(
  roster: T[],
  csvNumber: string | undefined | null,
): EmployeeImportAction<T> {
  const existing = findEmployeeByNumber(roster, csvNumber);
  if (existing) return { action: "update", existing };
  return { action: "create" };
}
