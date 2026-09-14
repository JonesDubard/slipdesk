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
