import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  employees: [] as Array<Record<string, unknown>>,
  sends: 0,
  companyFilter: null as string | null,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async () => {
        state.sends += 1;
        return { data: { id: "msg-1" }, error: null };
      },
    };
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {
        select() { return builder; },
        ilike(column: string, value: string) {
          filters[column] = String(value).toLowerCase();
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          if (table === "employees" && column === "company_id") state.companyFilter = String(value);
          return builder;
        },
        update() { return { eq: async () => ({}) }; },
        upsert: async () => ({ error: null }),
        insert() {
          return {
            select: () => ({ single: async () => ({ data: { id: "log-1" }, error: null }) }),
            then(resolve: (value: unknown) => void) { resolve({ error: null }); },
          };
        },
        maybeSingle: async () => ({ data: { name: "Co" }, error: null }),
        then(resolve: (value: unknown) => void) {
          if (table !== "employees") {
            resolve({ data: null, error: null });
            return;
          }
          const rows = state.employees.filter((row) => {
            const email = String(row.email ?? "").toLowerCase();
            return email === filters.email
              && row.is_active === filters.is_active
              && row.is_archived === filters.is_archived
              && row.portal_enabled === filters.portal_enabled
              && (filters.company_id == null || row.company_id === filters.company_id);
          });
          resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  }),
}));

import { requestPasswordResetByEmail } from "@/lib/notifications/service";

const base = {
  company_id: "co-1",
  full_name: "Ada",
  email: "ada@example.com",
  portal_enabled: true,
  is_active: true,
  is_archived: false,
};

describe("requestPasswordResetByEmail", () => {
  beforeEach(() => {
    state.employees = [];
    state.sends = 0;
    state.companyFilter = null;
    process.env.RESEND_API_KEY = "re_test";
  });

  it("returns a generic result and does not send when nothing matches", async () => {
    const result = await requestPasswordResetByEmail("ada@example.com");
    expect(result).toEqual({ accepted: true, emailed: false, ambiguous: false });
    expect(state.sends).toBe(0);
  });

  it("sends when exactly one employee matches", async () => {
    state.employees = [{ ...base, id: "emp-1" }];
    const result = await requestPasswordResetByEmail("  Ada@Example.com ");
    expect(result.ambiguous).toBe(false);
    expect(result.emailed).toBe(true);
    expect(state.sends).toBe(1);
  });

  it("does not send when two employees match", async () => {
    state.employees = [
      { ...base, id: "emp-1" },
      { ...base, id: "emp-2", company_id: "co-2" },
    ];
    const result = await requestPasswordResetByEmail("ada@example.com");
    expect(result).toEqual({ accepted: true, emailed: false, ambiguous: true });
    expect(state.sends).toBe(0);
  });

  it("scopes to a company when one is provided", async () => {
    state.employees = [
      { ...base, id: "emp-1", company_id: "co-1" },
      { ...base, id: "emp-2", company_id: "co-2" },
    ];
    const result = await requestPasswordResetByEmail("ada@example.com", { companyId: "co-1" });
    expect(state.companyFilter).toBe("co-1");
    expect(result.ambiguous).toBe(false);
    expect(result.emailed).toBe(true);
    expect(state.sends).toBe(1);
  });
});
