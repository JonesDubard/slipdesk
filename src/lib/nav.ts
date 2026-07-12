import type { SubscriptionTier } from "@/context/AppContext";
import { canUse, getEffectiveTier, type Feature } from "@/lib/plan-features";
import { can, type Permission, type Role } from "@/lib/rbac";

export interface NavItemDef {
  href: string;
  label: string;
  feature?: Feature;
  permission?: Permission;
}

export const DASHBOARD_NAV_ITEMS: NavItemDef[] = [
  { href: "/dashboard",  label: "Dashboard" },
  { href: "/employees",  label: "Employees",  permission: "employee:view" },
  { href: "/payroll",    label: "Payroll",    permission: "payroll:view" },
  { href: "/payroll/calendar", label: "Payroll Calendar", feature: "payrollCalendar", permission: "payroll:view" },
  { href: "/organization", label: "Organization", feature: "departmentManagement", permission: "company:manage" },
  { href: "/analytics",  label: "Analytics",  feature: "payrollAnalytics", permission: "analytics:view" },
  { href: "/compliance", label: "Compliance", feature: "complianceDashboard", permission: "compliance:view" },
  { href: "/reports",    label: "Reports",    permission: "report:view" },
  { href: "/audit",      label: "Audit",      feature: "auditTrail", permission: "audit:view" },
  { href: "/team",       label: "Team & Roles", feature: "advancedRoles", permission: "users:manage" },
  { href: "/billing",    label: "Billing",    permission: "billing:manage" },
  { href: "/settings",   label: "Settings" },
];

/** Resolve effective RBAC role for sidebar/API checks. Owners always get company_owner. */
export function resolveAppRole(memberRole: Role | null, profileRole: string | null | undefined): Role {
  if (memberRole) return memberRole;
  return "company_owner";
}

export function visibleNavItems(
  tier: SubscriptionTier,
  billingBypass: boolean,
  role: Role,
): NavItemDef[] {
  const effective = getEffectiveTier(tier, billingBypass);
  return DASHBOARD_NAV_ITEMS.filter((item) => {
    if (item.feature && !canUse(item.feature, effective)) return false;
    if (item.permission && !can(role, item.permission)) return false;
    return true;
  });
}

export function hasBillingNav(role: Role, tier: SubscriptionTier, billingBypass = false): boolean {
  return visibleNavItems(tier, billingBypass, role).some((i) => i.href === "/billing");
}
