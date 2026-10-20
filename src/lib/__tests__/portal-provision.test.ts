import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  DUPLICATE_EMPLOYEE_EMAIL,
  PORTAL_CONTACT_REQUIRED,
  employeeEmailCollision,
  portalAssignContact,
  whatsAppPinHref,
} from "@/lib/employee-portal/provision";
import { renderPasswordResetEmail, renderPortalInviteEmail } from "@/lib/notifications/templates";

const state = vi.hoisted(() => ({
  role: "hr_manager" as string | null,
  user: { id: "user-hr", email: "hr@example.com" } as { id: string; email: string } | null,
  employee: null as Record<string, unknown> | null,
  companyEmails: [] as Array<{ id: string; email: string }>,
  credential: null as { employee_id: string } | null,
  employeeUpdates: [] as Array<Record<string, unknown>>,
  credentialInserts: [] as Array<Record<string, unknown>>,
  credentialUpdates: [] as Array<Record<string, unknown>>,
  resetCalls: [] as Array<{ email: string; opts?: { templateKey?: string; companyId?: string } }>,
  authCalls: [] as string[],
}));

vi.mock("@/lib/notifications/service", () => ({
  requestPasswordResetByEmail: async (
    email: string,
    opts?: { templateKey?: string; companyId?: string },
  ) => {
    state.resetCalls.push({ email, opts });
    return { accepted: true, emailed: true, ambiguous: false };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}));

vi.mock("@/lib/auth/resolve-app-company", () => ({
  resolveAppCompanyAccess: async () => {
    if (!state.role) return null;
    return { companyId: "co-1", role: state.role, admin: {} };
  },
}));

vi.mock("@/lib/demo/assert-not-demo", () => ({
  assertNotDemoCompany: async () => null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: async () => {
          state.authCalls.push("createUser");
          return { data: { user: null }, error: { message: "unexpected" } };
        },
        generateLink: async () => {
          state.authCalls.push("generateLink");
          return { data: { properties: { hashed_token: "hash" } }, error: null };
        },
      },
    },
    from(table: string) {
      if (table === "employees") {
        let listed = false;
        let ilikeValue = "";
        const builder: Record<string, unknown> = {
          select() { return builder; },
          eq() { return builder; },
          ilike(_column: string, value: string) {
            listed = true;
            ilikeValue = String(value).trim().toLowerCase();
            return builder;
          },
          update(patch: Record<string, unknown>) {
            state.employeeUpdates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
          maybeSingle: async () => ({ data: state.employee, error: null }),
          then(resolve: (value: unknown) => void) {
            if (!listed) {
              resolve({ data: state.employee, error: null });
              return;
            }
            const rows = state.companyEmails.filter(
              (row) => row.email.trim().toLowerCase() === ilikeValue,
            );
            resolve({ data: rows, error: null });
          },
        };
        return builder;
      }
      if (table === "employee_credentials") {
        return {
          select() {
            return { eq: () => ({ maybeSingle: async () => ({ data: state.credential, error: null }) }) };
          },
          insert(row: Record<string, unknown>) {
            state.credentialInserts.push(row);
            return Promise.resolve({ error: null });
          },
          update(patch: Record<string, unknown>) {
            state.credentialUpdates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
          delete() { return { eq: async () => ({ error: null }) }; },
        };
      }
      if (table === "profiles") {
        return {
          select() { return { eq: () => ({ maybeSingle: async () => ({ data: { id: "auth-user" }, error: null }) }) }; },
          update() { return { eq: async () => ({ error: null }) }; },
          insert: async () => ({ error: null }),
        };
      }
      if (table === "company_members") {
        return {
          select() {
            return { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "mem-1" }, error: null }) }) }) };
          },
          update() { return { eq: async () => ({ error: null }) }; },
          insert: async () => ({ error: null }),
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  }),
}));

import { assignOrResetPortalPassword, invitePortalByEmail } from "@/lib/employee-portal/auth";
import { POST as inviteRoute } from "@/app/api/hr/employees/[id]/portal-invite/route";

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: "emp-1",
    company_id: "co-1",
    full_name: "Ada",
    email: null,
    phone: null,
    phone_e164: null,
    portal_enabled: false,
    is_active: true,
    is_archived: false,
    user_id: "auth-user",
    ...overrides,
  };
}

const assignOpts = {
  employeeId: "emp-1",
  companyId: "co-1",
  actorUserId: "user-hr",
  actorEmail: "hr@example.com",
  mode: "assign" as const,
};

beforeEach(() => {
  state.role = "hr_manager";
  state.user = { id: "user-hr", email: "hr@example.com" };
  state.employee = null;
  state.companyEmails = [];
  state.credential = null;
  state.employeeUpdates = [];
  state.credentialInserts = [];
  state.credentialUpdates = [];
  state.resetCalls = [];
  state.authCalls = [];
});

describe("portal assign contact", () => {
  it("assign with phone only returns a PIN and does not email it", async () => {
    state.employee = employee({ phone_e164: "+231775123456" });
    const result = await assignOrResetPortalPassword(assignOpts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.phone).toBe("+231775123456");
    expect(result.temporaryPassword).toMatch(/^[1-9]\d{7}$/);
    expect(state.employeeUpdates[0]).toMatchObject({ portal_enabled: true, phone_e164: "+231775123456" });
    expect(state.credentialInserts[0]).toMatchObject({ must_change_password: true });
    expect(state.resetCalls).toHaveLength(0);
    expect(state.authCalls).not.toContain("createUser");
  });

  it("assign with email only proceeds without a phone", async () => {
    state.employee = employee({ email: "Ada@Example.com" });
    const result = await assignOrResetPortalPassword(assignOpts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.phone).toBe("");
    expect(result.temporaryPassword).toMatch(/^\d{8}$/);
    expect(state.employeeUpdates[0]).toEqual({ portal_enabled: true });
    expect(state.credentialInserts[0]).toMatchObject({ must_change_password: true });
    expect(state.resetCalls).toHaveLength(0);
  });

  it("assign with both prefers the phone for the PIN path", async () => {
    state.employee = employee({ email: "ada@example.com", phone: "0775123456" });
    const result = await assignOrResetPortalPassword(assignOpts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.phone).toBe("+231775123456");
    expect(state.employeeUpdates[0]).toMatchObject({ portal_enabled: true, phone_e164: "+231775123456" });
    expect(portalAssignContact({ email: "ada@example.com", phone: "0775123456" })).toEqual({
      ok: true,
      phone: "+231775123456",
      email: "ada@example.com",
    });
    expect(state.resetCalls).toHaveLength(0);
  });

  it("assign with neither asks for an email or a Liberian phone", async () => {
    state.employee = employee({ email: "   ", phone: "", phone_e164: null });
    const result = await assignOrResetPortalPassword(assignOpts);
    expect(result).toEqual({ ok: false, error: PORTAL_CONTACT_REQUIRED, status: 400 });
    expect(state.employeeUpdates).toHaveLength(0);
    expect(state.credentialInserts).toHaveLength(0);
  });

  it("assign fails when the email collides with another employee in the company", async () => {
    state.employee = employee({ email: "ada@example.com" });
    state.companyEmails = [
      { id: "emp-1", email: "ada@example.com" },
      { id: "emp-2", email: "Ada@Example.com" },
    ];
    const result = await assignOrResetPortalPassword(assignOpts);
    expect(result).toEqual({ ok: false, error: DUPLICATE_EMPLOYEE_EMAIL, status: 409 });
    expect(state.credentialInserts).toHaveLength(0);
  });

  it("assign still issues a PIN when a phone exists and the email is shared", async () => {
    state.employee = employee({
      email: "employee@company.lr",
      phone: "+231770000001",
    });
    state.companyEmails = [
      { id: "emp-1", email: "employee@company.lr" },
      { id: "emp-2", email: "employee@company.lr" },
    ];
    const result = await assignOrResetPortalPassword(assignOpts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.phone).toBe("+231770000001");
    expect(result.temporaryPassword).toMatch(/^\d{8}$/);
    expect(state.credentialInserts).toHaveLength(1);
  });
});

describe("portal email invite", () => {
  it("invite route requires the HR permission", async () => {
    state.role = "employee";
    state.employee = employee({ email: "ada@example.com" });
    const res = await inviteRoute(
      new NextRequest("http://localhost/api/hr/employees/emp-1/portal-invite", { method: "POST" }),
      { params: Promise.resolve({ id: "emp-1" }) },
    );
    expect(res.status).toBe(403);
    expect(state.resetCalls).toHaveLength(0);
  });

  it("invite route requires a non-blank email", async () => {
    state.employee = employee({ email: "  ", phone_e164: "+231775123456" });
    const res = await inviteRoute(
      new NextRequest("http://localhost/api/hr/employees/emp-1/portal-invite", { method: "POST" }),
      { params: Promise.resolve({ id: "emp-1" }) },
    );
    expect(res.status).toBe(400);
    expect(state.resetCalls).toHaveLength(0);
    expect(state.employeeUpdates).toHaveLength(0);
  });

  it("invite route calls the email sender once and sets the portal flags", async () => {
    state.employee = employee({ email: "ada@example.com" });
    const res = await inviteRoute(
      new NextRequest("http://localhost/api/hr/employees/emp-1/portal-invite", { method: "POST" }),
      { params: Promise.resolve({ id: "emp-1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.portalEnabled).toBe(true);
    expect(body.mustChangePassword).toBe(false);
    expect(body.temporaryPassword).toBeUndefined();
    expect(state.resetCalls).toEqual([
      { email: "ada@example.com", opts: { companyId: "co-1", templateKey: "portal_invite" } },
    ]);
    expect(state.employeeUpdates).toContainEqual({ portal_enabled: true });
    expect(state.credentialInserts[0]).toMatchObject({ must_change_password: false });
    expect(state.authCalls).not.toContain("createUser");

    const direct = await invitePortalByEmail({
      employeeId: "emp-1",
      companyId: "co-1",
      actorUserId: "user-hr",
    });
    expect(direct.ok).toBe(true);
    expect(state.resetCalls).toHaveLength(2);
  });

  it("invite route fails when the email collides", async () => {
    state.employee = employee({ email: "ada@example.com" });
    state.companyEmails = [{ id: "emp-9", email: "ada@example.com" }];
    const res = await inviteRoute(
      new NextRequest("http://localhost/api/hr/employees/emp-1/portal-invite", { method: "POST" }),
      { params: Promise.resolve({ id: "emp-1" }) },
    );
    expect(res.status).toBe(409);
    expect(state.resetCalls).toHaveLength(0);
  });
});

describe("email uniqueness and WhatsApp relay", () => {
  it("blocks a trimmed case-insensitive email used by someone else", () => {
    const rows = [{ id: "a", email: " Ada@Example.com " }];
    expect(employeeEmailCollision("ada@example.com", rows, "b")).toBe(true);
    expect(employeeEmailCollision("ada@example.com", rows, "a")).toBe(false);
    expect(employeeEmailCollision("  ", rows, "b")).toBe(false);
  });

  it("builds a WhatsApp link only for a valid phone and a configured app URL", () => {
    const href = whatsAppPinHref("+231775123456", "12345678", "https://slipdesk.com/");
    expect(href).toBe(
      `https://wa.me/231775123456?text=${encodeURIComponent("Your SlipDesk portal PIN is 12345678. Log in at https://slipdesk.com/portal/login")}`,
    );
    expect(whatsAppPinHref("+231775123456", "12345678", "")).toBeNull();
    expect(whatsAppPinHref("+231775123456", "12345678", undefined)).toBeNull();
    expect(whatsAppPinHref("12345", "12345678", "https://slipdesk.com")).toBeNull();
  });

  it("keeps the password reset subject and adds a portal invite subject", () => {
    const branding = { companyName: "Co" };
    expect(renderPasswordResetEmail({
      employeeName: "Ada",
      companyName: "Co",
      branding,
    }).subject).toBe("Reset your Slipdesk portal password");
    expect(renderPortalInviteEmail({
      employeeName: "Ada",
      companyName: "Co",
      branding,
    }).subject).toBe("Set up your SlipDesk portal");
  });
});
