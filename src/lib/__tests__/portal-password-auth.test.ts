import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/employee-portal/password";

const state = vi.hoisted(() => ({
  emailRows: [] as Array<Record<string, unknown>>,
  phoneExact: [] as Array<Record<string, unknown>>,
  phoneScan: [] as Array<Record<string, unknown>>,
  credential: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      let kind: "email" | "phone" | "scan" = "scan";
      const builder: Record<string, unknown> = {
        select() { return builder; },
        ilike() { kind = "email"; return builder; },
        eq(column: string) {
          if (column === "phone_e164") kind = "phone";
          return builder;
        },
        update() { return { eq: async () => ({}) }; },
        insert: async () => ({}),
        maybeSingle: async () => ({
          data: table === "employee_credentials" ? state.credential : null,
        }),
        then(resolve: (value: unknown) => void) {
          const data = kind === "email"
            ? state.emailRows
            : kind === "phone"
              ? state.phoneExact
              : state.phoneScan;
          resolve({ data });
        },
      };
      return builder;
    },
  }),
}));

import { GENERIC_LOGIN_ERROR, PasswordAuth, readLoginIdentifier } from "@/lib/employee-portal/password-auth";

const password = "482910";
const hash = hashPassword(password);

function employee(overrides: Record<string, unknown>) {
  return {
    id: "emp-1",
    company_id: "co-1",
    phone_e164: "+231775123456",
    phone: "0775123456",
    email: "ada@example.com",
    portal_enabled: true,
    is_active: true,
    is_archived: false,
    ...overrides,
  };
}

describe("portal password login", () => {
  const auth = new PasswordAuth();

  beforeEach(() => {
    state.emailRows = [];
    state.phoneExact = [];
    state.phoneScan = [];
    state.credential = { password_hash: hash, must_change_password: false, failed_attempts: 0, locked_until: null };
  });

  it("login with email succeeds", async () => {
    state.emailRows = [employee({})];
    const result = await auth.authenticate({ method: "password", identifier: "Ada@Example.com", password });
    expect(result.ok).toBe(true);
  });

  it("login with phone succeeds", async () => {
    state.phoneExact = [employee({})];
    const result = await auth.authenticate({ method: "password", identifier: "0775123456", password });
    expect(result.ok).toBe(true);
  });

  it("login with unknown identifier fails with the same generic message", async () => {
    const emailMiss = await auth.authenticate({ method: "password", identifier: "missing@example.com", password });
    const phoneMiss = await auth.authenticate({ method: "password", identifier: "0886000000", password });
    expect(emailMiss.ok).toBe(false);
    expect(phoneMiss.ok).toBe(false);
    if (!emailMiss.ok && !phoneMiss.ok) {
      expect(emailMiss.error).toBe(GENERIC_LOGIN_ERROR);
      expect(phoneMiss.error).toBe(GENERIC_LOGIN_ERROR);
    }
  });

  it("rejects an ambiguous email without choosing a row", async () => {
    state.emailRows = [employee({ id: "emp-1" }), employee({ id: "emp-2", company_id: "co-2" })];
    const result = await auth.authenticate({ method: "password", identifier: "ada@example.com", password });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(GENERIC_LOGIN_ERROR);
  });

  it("rejects an ambiguous phone without choosing a row", async () => {
    state.phoneExact = [employee({ id: "emp-1" }), employee({ id: "emp-2", company_id: "co-2" })];
    const result = await auth.authenticate({ method: "password", identifier: "+231775123456", password });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(GENERIC_LOGIN_ERROR);
  });

  it("still accepts phone, email, or identifier on the login body", () => {
    expect(readLoginIdentifier({ phone: "0775123456" })).toBe("0775123456");
    expect(readLoginIdentifier({ email: "ada@example.com" })).toBe("ada@example.com");
    expect(readLoginIdentifier({ identifier: "ada@example.com", phone: "077" })).toBe("ada@example.com");
  });
});
