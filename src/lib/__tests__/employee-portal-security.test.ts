/**
 * Critical security tests — cross-employee data access must be rejected.
 * These exercise the same gates used by /api/employee/* routes.
 */

import { describe, it, expect, vi } from "vitest";
import { assertOwnEmployee, type LinkedEmployee } from "@/lib/employee-portal/session";
import { getEmployeePayslip, listEmployeePayslips } from "@/lib/employee-portal/payslips";
import { getNasscorpContributions } from "@/lib/employee-portal/nasscorp";

const attacker: LinkedEmployee = {
  id: "emp-attacker",
  companyId: "co-1",
  userId: "user-attacker",
  employeeNumber: "E-ATK",
  fullName: "Attacker",
  firstName: "At",
  lastName: "Tacker",
  phone: "0775000000",
  phoneE164: "+231775000000",
  email: "",
  address: "",
  county: "",
  jobTitle: "",
  department: "",
  paymentMethod: "cash",
  bankName: "",
  accountNumber: "",
  bankBranch: "",
  momoNumber: "",
  nasscorpNumber: "",
};

const victimId = "emp-victim";

describe("API security: cross-employee access rejection", () => {
  it("rejects employeeId query param pointing at another employee", () => {
    const gate = assertOwnEmployee(attacker, victimId);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.status).toBe(403);
    }
  });

  it("payslip list query always filters by authenticated employee id only", async () => {
    const eq = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn().mockReturnValue({ eq, order, limit });
    // chain: from().select().eq().eq().order().limit()
    eq.mockImplementation(function (this: unknown) {
      return { eq, order, limit, select, in: vi.fn().mockResolvedValue({ data: [] }) };
    });
    order.mockReturnValue({ limit });
    limit.mockResolvedValue({ data: [], error: null });

    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => {
          const chain: Record<string, unknown> = {};
          chain.eq = vi.fn(() => chain);
          chain.order = vi.fn(() => chain);
          chain.limit = vi.fn(async () => ({ data: [], error: null }));
          chain.in = vi.fn(async () => ({ data: [], error: null }));
          chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          return chain;
        }),
      })),
    };

    await listEmployeePayslips(client, attacker.id, attacker.companyId);

    // First from() call should be pay_run_lines scoped to attacker
    expect(client.from).toHaveBeenCalledWith("pay_run_lines");
    const selectFn = client.from.mock.results[0].value.select;
    expect(selectFn).toHaveBeenCalled();
    const chain = selectFn.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith("employee_id", attacker.id);
    expect(chain.eq).toHaveBeenCalledWith("company_id", attacker.companyId);
  });

  it("getEmployeePayslip requires matching employee_id in the query", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => {
          const chain: Record<string, unknown> = {};
          chain.eq = vi.fn(() => chain);
          chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          return chain;
        }),
      })),
    };

    const result = await getEmployeePayslip(client, "line-victim", attacker.id, attacker.companyId);
    expect(result).toBeNull();

    const chain = client.from.mock.results[0].value.select.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith("id", "line-victim");
    expect(chain.eq).toHaveBeenCalledWith("employee_id", attacker.id);
    // Even if attacker passes victim line id, employee_id filter is attacker's own id
    expect(chain.eq).not.toHaveBeenCalledWith("employee_id", victimId);
  });

  it("NASSCORP query is scoped to authenticated employee only", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => {
          const chain: Record<string, unknown> = {};
          chain.eq = vi.fn(() => chain);
          chain.order = vi.fn(() => chain);
          chain.in = vi.fn(async () => ({ data: [], error: null }));
          // terminal for lines query
          chain.then = undefined;
          // make awaitable by returning promise from order
          chain.order = vi.fn(async () => ({ data: [], error: null }));
          return chain;
        }),
      })),
    };

    await getNasscorpContributions(client, attacker.id, attacker.companyId);
    const chain = client.from.mock.results[0].value.select.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith("employee_id", attacker.id);
    expect(chain.eq).toHaveBeenCalledWith("company_id", attacker.companyId);
  });

  it("simulates API handler rejection when employeeId != linked.id", () => {
    // Mirrors /api/employee/payslips and /api/employee/nasscorp
    function handle(linked: LinkedEmployee | null, requestedEmployeeId: string | null) {
      const gate = assertOwnEmployee(linked, requestedEmployeeId);
      if (!gate.ok) return { status: gate.status, body: { error: gate.error } };
      return { status: 200, body: { employeeId: gate.employee.id } };
    }

    const blocked = handle(attacker, victimId);
    expect(blocked.status).toBe(403);
    expect(String((blocked.body as { error: string }).error)).toMatch(/Forbidden/i);

    const allowed = handle(attacker, attacker.id);
    expect(allowed.status).toBe(200);
  });
});
