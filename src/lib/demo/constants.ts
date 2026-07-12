/** Shared Interactive Demo constants */

export const DEMO_READONLY_CODE = "DEMO_READONLY" as const;

export const DEMO_READONLY_MESSAGE =
  "This is a read-only demo. Purchase a plan or book a live demo to make changes.";

export type DemoFeatureName =
  | "add_employee"
  | "edit_employee"
  | "delete_employee"
  | "import_employees"
  | "generate_payroll"
  | "email_payslips"
  | "export_download"
  | "settings"
  | "api_keys"
  | "team_invite"
  | "org_units"
  | "compliance_snapshot"
  | "generic";

export type DemoCta = "pricing" | "book";

export interface DemoPromptCopy {
  title: string;
  body: string;
  primaryCta: DemoCta;
}

export const DEMO_FEATURE_COPY: Record<DemoFeatureName, DemoPromptCopy> = {
  add_employee: {
    title: "Read-only demo",
    body: "This is a read-only demo. To manage real employees, purchase a plan.",
    primaryCta: "pricing",
  },
  edit_employee: {
    title: "Read-only demo",
    body: "Employee edits are disabled in the demo. Purchase a plan to manage your workforce.",
    primaryCta: "pricing",
  },
  delete_employee: {
    title: "Read-only demo",
    body: "Deleting employees is disabled in the demo. Purchase a plan to manage real employees.",
    primaryCta: "pricing",
  },
  import_employees: {
    title: "Import disabled",
    body: "CSV import is disabled in the demo. Purchase a plan to onboard your team.",
    primaryCta: "pricing",
  },
  generate_payroll: {
    title: "Payroll processing disabled",
    body: "Payroll processing is disabled in the demo. Book a live demo to see this in action.",
    primaryCta: "book",
  },
  email_payslips: {
    title: "Sending disabled",
    body: "Emailing payslips is disabled in the demo. Book a live demo to see delivery in action.",
    primaryCta: "book",
  },
  export_download: {
    title: "Downloads locked",
    body: "Downloading is available after onboarding.",
    primaryCta: "pricing",
  },
  settings: {
    title: "Settings locked",
    body: "Configuration changes are locked in the demo. Book a live demo or purchase a plan.",
    primaryCta: "book",
  },
  api_keys: {
    title: "API access locked",
    body: "Creating API keys is disabled in the demo. Contact sales for Enterprise access.",
    primaryCta: "book",
  },
  team_invite: {
    title: "Team invites locked",
    body: "Inviting teammates is disabled in the demo. Purchase a plan to collaborate.",
    primaryCta: "pricing",
  },
  org_units: {
    title: "Organization locked",
    body: "Departments and branches cannot be changed in the demo.",
    primaryCta: "book",
  },
  compliance_snapshot: {
    title: "Compliance history locked",
    body: "Saving compliance snapshots is disabled in the demo.",
    primaryCta: "book",
  },
  generic: {
    title: "Read-only demo",
    body: DEMO_READONLY_MESSAGE,
    primaryCta: "book",
  },
};

export function bookDemoUrl(): string {
  const raw = process.env.NEXT_PUBLIC_BOOK_DEMO_URL || "#contact";
  if (raw.startsWith("#")) return `/${raw}`;
  return raw;
}

export function isDemoModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true";
}
