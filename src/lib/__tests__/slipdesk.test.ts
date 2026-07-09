import { describe, it, expect } from "vitest";
import { resolveAppRole, hasBillingNav, visibleNavItems } from "@/lib/nav";
import { buildPaymentReceiptUpdate } from "@/lib/payments/receipt";
import { isPlatformAdminRole, isDesignatedPlatformAdmin } from "@/lib/auth/platform-admin";
import { can } from "@/lib/rbac";
import { shouldCreateOwnedCompany } from "@/lib/auth/team-invite";

describe("resolveAppRole", () => {
  it("gives company owners billing access regardless of profile role member", () => {
    const role = resolveAppRole(null, "member");
    expect(role).toBe("company_owner");
    expect(can(role, "billing:manage")).toBe(true);
  });

  it("keeps team member roles from company_members", () => {
    expect(resolveAppRole("payroll_officer", "member")).toBe("payroll_officer");
    expect(can(resolveAppRole("payroll_officer", "member"), "billing:manage")).toBe(false);
  });

  it("shows billing in sidebar for active company owners on starter plan", () => {
    expect(hasBillingNav("company_owner", "basic")).toBe(true);
    expect(visibleNavItems("basic", false, "company_owner").some((i) => i.href === "/billing")).toBe(true);
  });

  it("hides billing for payroll officers", () => {
    expect(hasBillingNav("payroll_officer", "basic")).toBe(false);
  });
});

describe("buildPaymentReceiptUpdate", () => {
  it("stores trimmed transaction id in receipt_note", () => {
    expect(buildPaymentReceiptUpdate("  09876  ", null)).toEqual({ receipt_note: "09876" });
  });

  it("includes receipt_url when screenshot provided", () => {
    expect(buildPaymentReceiptUpdate("TX1", "https://example.com/a.png")).toEqual({
      receipt_note: "TX1",
      receipt_url: "https://example.com/a.png",
    });
  });

  it("allows screenshot-only submission", () => {
    expect(buildPaymentReceiptUpdate("", "https://example.com/a.png")).toEqual({
      receipt_note: null,
      receipt_url: "https://example.com/a.png",
    });
  });
});

describe("team invite bootstrap", () => {
  it("does not create a company when user has a pending invite", () => {
    expect(
      shouldCreateOwnedCompany({
        isPlatformAdmin: false,
        hasOwnedCompany: false,
        hasActiveMembership: false,
        hasPendingInvite: true,
      }),
    ).toBe(false);
  });

  it("creates a company for a net-new user with no invite", () => {
    expect(
      shouldCreateOwnedCompany({
        isPlatformAdmin: false,
        hasOwnedCompany: false,
        hasActiveMembership: false,
        hasPendingInvite: false,
      }),
    ).toBe(true);
  });
});

describe("platform admin", () => {
  it("recognises admin and super_admin roles", () => {
    expect(isPlatformAdminRole("admin")).toBe(true);
    expect(isPlatformAdminRole("super_admin")).toBe(true);
    expect(isPlatformAdminRole("member")).toBe(false);
  });

  it("matches designated admin email case-insensitively", () => {
    const prev = process.env.SLIPDESK_ADMIN_EMAIL;
    process.env.SLIPDESK_ADMIN_EMAIL = "Hello@Slipdesk.com";
    expect(isDesignatedPlatformAdmin("hello@slipdesk.com")).toBe(true);
    process.env.SLIPDESK_ADMIN_EMAIL = prev;
  });
});
