/** Normalize optional gender values from CSV/forms. */
export type EmployeeGender = "male" | "female" | "other" | "prefer_not_to_say";

const ALIASES: Record<string, EmployeeGender> = {
  m: "male",
  male: "male",
  man: "male",
  f: "female",
  female: "female",
  woman: "female",
  o: "other",
  other: "other",
  nb: "other",
  "non-binary": "other",
  nonbinary: "other",
  "prefer not to say": "prefer_not_to_say",
  prefer_not_to_say: "prefer_not_to_say",
  /** CSVs sometimes use "unknown" — treat as prefer-not-to-say, not an error (optional field). */
  unknown: "prefer_not_to_say",
};

export function normalizeGender(raw: string | undefined | null): {
  value: EmployeeGender | "";
  error?: string;
} {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: "" };
  const key = trimmed.toLowerCase();
  const mapped = ALIASES[key];
  if (!mapped) {
    return {
      value: "",
      error: `Invalid gender "${trimmed}". Use male, female, other, or prefer_not_to_say.`,
    };
  }
  return { value: mapped };
}

export function genderLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}
