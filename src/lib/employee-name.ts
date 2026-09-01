/** Build display full name: first + optional middle + last. */
export function formatEmployeeFullName(
  firstName: string,
  lastName: string,
  middleName?: string | null,
): string {
  return [firstName, middleName, lastName]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
