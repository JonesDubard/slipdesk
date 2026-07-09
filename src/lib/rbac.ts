/**
 * Slipdesk — Role-Based Access Control (RBAC)
 *
 * Granular, additive permission layer. This does NOT replace the existing
 * `profiles.role` ('admin' | 'member') check used in the dashboard sidebar —
 * it extends it. Legacy roles map onto the new role set:
 *   'admin'  → 'company_owner'
 *   'member' → 'payroll_officer'
 *
 * Every capability is expressed as a `Permission`. A role is simply a set of
 * permissions. UI and API layers should call `can(role, permission)` rather
 * than checking role names directly, so permissions can evolve independently.
 */

export type Role =
  | "super_admin"
  | "company_owner"
  | "payroll_officer"
  | "finance_manager"
  | "hr_manager"
  | "auditor"
  | "executive";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  company_owner: "Company Owner",
  payroll_officer: "Payroll Officer",
  finance_manager: "Finance Manager",
  hr_manager: "HR Manager",
  auditor: "Auditor",
  executive: "Executive (Read Only)",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "Full platform access, including cross-company administration.",
  company_owner: "Owns the company account and controls all settings and billing.",
  payroll_officer: "Creates and edits payroll runs and manages employees.",
  finance_manager: "Reviews and approves payroll from a financial standpoint.",
  hr_manager: "Manages employees and approves payroll from an HR standpoint.",
  auditor: "Read-only access to audit logs, reports and compliance.",
  executive: "Read-only executive dashboards and high-level analytics.",
};

export type Permission =
  // Employees
  | "employee:view"
  | "employee:create"
  | "employee:edit"
  | "employee:delete"
  // Payroll
  | "payroll:view"
  | "payroll:create"
  | "payroll:edit"
  | "payroll:submit" // move draft → review
  | "payroll:approve" // approve within workflow
  | "payroll:lock"
  | "payroll:reopen"
  | "payroll:release" // release payslips
  // Compliance & reporting
  | "compliance:view"
  | "report:view"
  | "report:export"
  // Analytics
  | "analytics:view"
  | "analytics:executive"
  // Administration
  | "company:manage"
  | "billing:manage"
  | "users:manage"
  | "audit:view"
  | "notifications:view";

const ALL_PERMISSIONS: Permission[] = [
  "employee:view", "employee:create", "employee:edit", "employee:delete",
  "payroll:view", "payroll:create", "payroll:edit", "payroll:submit",
  "payroll:approve", "payroll:lock", "payroll:reopen", "payroll:release",
  "compliance:view", "report:view", "report:export",
  "analytics:view", "analytics:executive",
  "company:manage", "billing:manage", "users:manage",
  "audit:view", "notifications:view",
];

const READ_ONLY: Permission[] = [
  "employee:view", "payroll:view", "compliance:view",
  "report:view", "analytics:view", "notifications:view",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [...ALL_PERMISSIONS],
  company_owner: [...ALL_PERMISSIONS],
  payroll_officer: [
    "employee:view", "employee:create", "employee:edit",
    "payroll:view", "payroll:create", "payroll:edit", "payroll:submit",
    "compliance:view", "report:view", "report:export",
    "analytics:view", "notifications:view",
  ],
  finance_manager: [
    "employee:view",
    "payroll:view", "payroll:approve", "payroll:lock", "payroll:release",
    "compliance:view", "report:view", "report:export",
    "analytics:view", "analytics:executive",
    "billing:manage", "audit:view", "notifications:view",
  ],
  hr_manager: [
    "employee:view", "employee:create", "employee:edit", "employee:delete",
    "payroll:view", "payroll:approve",
    "compliance:view", "report:view", "report:export",
    "analytics:view", "notifications:view",
  ],
  auditor: [
    ...READ_ONLY,
    "report:export", "audit:view",
  ],
  executive: [
    "employee:view", "payroll:view", "compliance:view",
    "report:view", "analytics:view", "analytics:executive",
    "notifications:view",
  ],
};

/** Legacy `profiles.role` → new Role. */
export function normalizeRole(raw: string | null | undefined): Role {
  switch (raw) {
    case "super_admin":
    case "company_owner":
    case "payroll_officer":
    case "finance_manager":
    case "hr_manager":
    case "auditor":
    case "executive":
      return raw;
    case "admin":
      return "company_owner";
    case "owner":
      return "company_owner";
    case "member":
    default:
      return "payroll_officer";
  }
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function canAll(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Roles that are allowed to act as a step in the payroll approval workflow. */
export const APPROVAL_CHAIN: Role[] = [
  "payroll_officer",
  "finance_manager",
  "hr_manager",
  "company_owner",
];
