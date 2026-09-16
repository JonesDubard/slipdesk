import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parseEmployeeCSV } from "@/lib/csv/parse-employee-csv";
import {
  applyEnsuredBranch,
  createOrgBranchApi,
  ensureOrgBranchesForImport,
  interpretOrgUnitsListResponse,
  orgUnitsFailureMessage,
  previewEmployeeCsvRows,
  unregisteredBranchMessage,
} from "@/lib/csv/resolve-branch";
import {
  isCookieAuthApiPath,
  shouldCreateSupabaseInProxy,
} from "@/lib/auth/proxy-session";
import { authorizeOrgUnitsAccess, orgBranchListScope } from "@/lib/org/units-access";
import {
  UNASSIGNED_BRANCH_FILTER,
  aggregateByBranchId,
  assignBranchFromOrg,
  branchesMissingFromOrg,
  employeeMatchesBranchFilter,
  matchEmployeeBranchToOrg,
  resolveEmployeeBranchWrite,
  syncBranchAssignment,
} from "@/lib/org/employee-branch";
import { filterEmployeesForBranchScope } from "@/lib/payroll/branch-scope";
import type { Employee } from "@/context/AppContext";

const FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/truck-driver-payslip.csv"),
  "utf8",
);

const COMPANY_A = "co-a";
const COMPANY_B = "co-b";
const BANGLI = { id: "br-bangli", companyId: COMPANY_A, name: "Bangli" };
const BUCHANAN = { id: "br-buchanan", companyId: COMPANY_A, name: "Buchanan" };
const FOREIGN = { id: "br-foreign", companyId: COMPANY_B, name: "Bangli" };

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "e1",
    employeeNumber: "EMP-1",
    firstName: "Ada",
    middleName: "",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    jobTitle: "Driver",
    department: "Operations",
    email: "",
    phone: "",
    county: "Bong",
    startDate: "2026-05-25",
    employmentType: "contractor",
    currency: "USD",
    rate: 1.44,
    standardHours: 173.33,
    allowances: 0,
    nasscorpNumber: "",
    paymentMethod: "mtn_momo",
    bankName: "Lonestar",
    accountNumber: "",
    momoNumber: "",
    isActive: true,
    isArchived: false,
    branch: "Bangli",
    branchId: "br-bangli",
    ...overrides,
  };
}

describe("backfill matching helper", () => {
  it("matches names case-insensitively within the same company", () => {
    expect(matchEmployeeBranchToOrg(
      { companyId: COMPANY_A, branch: "  BANGLI " },
      [BANGLI, FOREIGN],
    )).toEqual(BANGLI);
  });

  it("ignores the same branch name on another company", () => {
    expect(matchEmployeeBranchToOrg(
      { companyId: COMPANY_A, branch: "Bangli" },
      [FOREIGN],
    )).toBeNull();
  });

  it("creates missing org units per company and skips blanks", () => {
    expect(branchesMissingFromOrg(
      [
        { companyId: COMPANY_A, branch: "Bangli" },
        { companyId: COMPANY_A, branch: "bangli" },
        { companyId: COMPANY_A, branch: "  " },
        { companyId: COMPANY_B, branch: "Bangli" },
      ],
      [BANGLI],
    )).toEqual([{ companyId: COMPANY_B, name: "Bangli" }]);
  });
});

describe("CSV import attaches branch_id", () => {
  it("preview of template Sinkor/Paynesville rows has no unregistered-branch errors", () => {
    const csv = `employee_number,first_name,middle_name,last_name,gender,job_title,department,branch,email,phone,county,start_date,employment_type,currency,rate,standard_hours,allowances,nasscorp_number,payment_method,bank_name,account_number,momo_number,regular_hours,overtime_hours,holiday_hours,ded_pay_advance,ded_food,ded_transportation,ded_loan_repayment,ded_other
EMP-001,Moses,James,Kollie,male,Operations Manager,Operations,Sinkor,m.kollie@co.lr,+231770000001,Montserrado,2023-01-15,full_time,USD,8.50,173.33,0,NSC-001-2024,bank_transfer,Ecobank Liberia,1234567890,,173.33,0,0,100,30,20,0,0
EMP-002,Fanta,,Kamara,female,Finance Officer,Finance,Paynesville,f.kamara@co.lr,+231770000002,Montserrado,2023-03-01,full_time,LRD,1500,173.33,50000,NSC-002-2024,mtn_momo,,,0770000002,173.33,0,8,0,0,0,250,0`;
    const parsed = parseEmployeeCSV(csv, { registeredBranches: [] });
    expect(parsed).toHaveLength(2);
    expect(parsed.every((r) => r.errors.length === 0)).toBe(true);
    expect(parsed.every((r) => !r.errors.some((e) => /is not registered/i.test(e)))).toBe(true);
    expect(parsed[0].data.branch).toBe("Sinkor");
    expect(parsed[1].data.branch).toBe("Paynesville");
    const preview = previewEmployeeCsvRows(
      parsed.map((r) => ({
        ...r,
        errors: [...r.errors, unregisteredBranchMessage(r.data.branch ?? "")],
      })),
    );
    expect(preview.every((r) => r.errors.length === 0)).toBe(true);
    expect(preview[0].data.branch).toBe("Sinkor");
    expect(preview[1].data.branch).toBe("Paynesville");
  });

  it("does not treat a 401 org-units body as an empty registry / unregistered rows", () => {
    const interpreted = interpretOrgUnitsListResponse(401, {
      error: "Unauthorized",
      items: [],
    });
    expect(interpreted.ok).toBe(false);
    if (interpreted.ok) return;
    expect(interpreted.error).toMatch(/authentication failed|session/i);
    expect(interpreted.error).not.toMatch(/is not registered/i);

    const preview = previewEmployeeCsvRows([
      { data: { branch: "Sinkor" }, errors: [] },
      { data: { branch: "Paynesville" }, errors: [] },
    ]);
    expect(preview.every((r) => r.errors.length === 0)).toBe(true);
    expect(preview.every((r) => !r.errors.some((e) => /is not registered/i.test(e)))).toBe(true);
  });

  it("fails ensureOrgBranchesForImport on 401 without creating or saying unregistered", async () => {
    const created: string[] = [];
    const result = await ensureOrgBranchesForImport(
      ["Sinkor", "Paynesville"],
      {
        list: async () => ({ status: 401, error: "Unauthorized", items: [] }),
        create: async (name) => {
          created.push(name);
          return { status: 200, item: { id: "x", name } };
        },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/authentication failed|session/i);
      expect(result.error).not.toMatch(/is not registered/i);
    }
    expect(created).toEqual([]);
  });

  it("reuses an existing org branch id and does not POST it again", async () => {
    const created: string[] = [];
    const result = await ensureOrgBranchesForImport(["  sinkor "], {
      list: async () => ({ status: 200, items: [{ id: "br-sinkor", name: "Sinkor" }] }),
      create: async (name) => {
        created.push(name);
        return { status: 200, item: { id: "new", name } };
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(created).toEqual([]);
    expect(result.branches).toEqual([{ id: "br-sinkor", name: "Sinkor" }]);
    const mapped = applyEnsuredBranch({ branch: "SINKOR" }, result);
    expect(mapped.branchId).toBe("br-sinkor");
    expect(mapped.branch).toBe("Sinkor");
  });

  it("creates unknown Bangli and assigns that id; blank stays Unassigned", async () => {
    const created: string[] = [];
    const store: { id: string; name: string }[] = [];
    const result = await ensureOrgBranchesForImport(
      ["Bangli", "", "  ", "bangli"],
      {
        list: async () => ({ status: 200, items: [...store] }),
        create: async (name) => {
          created.push(name);
          const item = { id: "br-bangli", name };
          store.push(item);
          return { status: 200, item };
        },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(created).toEqual(["Bangli"]);
    expect(result.branches).toEqual([{ id: "br-bangli", name: "Bangli" }]);

    const bangliRow = applyEnsuredBranch({ branch: "bangli" }, result);
    expect(bangliRow.branchId).toBe("br-bangli");
    expect(bangliRow.branch).toBe("Bangli");

    const blankRow = applyEnsuredBranch({ branch: "  " }, result);
    expect(blankRow.branchId).toBeNull();
    expect(blankRow.branch).toBe("");
  });

  it("maps the 32-row truck-driver fixture onto the created Bangli id", async () => {
    const parsed = parseEmployeeCSV(FIXTURE);
    const result = await ensureOrgBranchesForImport(
      parsed.map((r) => r.data.branch),
      {
        list: async () => ({ status: 200, items: [] }),
        create: async (name) => ({ status: 200, item: { id: "br-bangli", name } }),
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mapped = parsed.map((r) => applyEnsuredBranch(r.data, result));
    expect(mapped).toHaveLength(32);
    expect(mapped.every((r) => r.branchId === "br-bangli")).toBe(true);
    expect(mapped.every((r) => r.branch === "Bangli")).toBe(true);
  });
});

describe("employee list filter by branchId", () => {
  const org = [
    { id: BANGLI.id, name: BANGLI.name },
    { id: BUCHANAN.id, name: BUCHANAN.name },
  ];
  const emps = [
    employee(),
    employee({ id: "e2", employeeNumber: "EMP-2", branchId: "br-buchanan", branch: "Buchanan" }),
    employee({ id: "e3", employeeNumber: "EMP-3", branchId: null, branch: "" }),
    employee({ id: "e4", employeeNumber: "EMP-4", branchId: null, branch: "Bangli" }),
  ];

  it("returns only employees with that branch id (name fallback during transition)", () => {
    const bangli = emps.filter((e) => employeeMatchesBranchFilter(e, BANGLI.id, org));
    expect(bangli.map((e) => e.id)).toEqual(["e1", "e4"]);
    expect(emps.filter((e) => employeeMatchesBranchFilter(e, BUCHANAN.id, org))).toHaveLength(1);
  });

  it("treats Unassigned as null branch_id and blank name", () => {
    const unassigned = emps.filter((e) =>
      employeeMatchesBranchFilter(e, UNASSIGNED_BRANCH_FILTER, org),
    );
    expect(unassigned.map((e) => e.id)).toEqual(["e3"]);
  });
});

describe("org aggregation by branch_id", () => {
  it("counts headcount and sums rate for the 32-row Bangli fixture", () => {
    const parsed = parseEmployeeCSV(FIXTURE);
    const employees = parsed.map((r) => ({
      branchId: "br-bangli",
      isActive: true,
      isArchived: false,
      rate: r.data.rate ?? 0,
    }));
    const summary = aggregateByBranchId(
      [{ id: "br-bangli", name: "Bangli" }],
      employees,
    );
    expect(summary.totalActive).toBe(32);
    expect(summary.unassigned).toBe(0);
    expect(summary.branches[0].employees).toBe(32);
    expect(summary.branches[0].salaryMass).toBeCloseTo(
      parsed.reduce((s, r) => s + (r.data.rate ?? 0), 0),
    );
  });

  it("splits the same fixture across two branch ids without mixing names", () => {
    const parsed = parseEmployeeCSV(FIXTURE);
    const employees = parsed.map((r, i) => ({
      branchId: i < 16 ? "br-bangli" : "br-buchanan",
      isActive: true,
      isArchived: false,
      rate: r.data.rate ?? 0,
    }));
    const summary = aggregateByBranchId(
      [
        { id: "br-bangli", name: "Bangli" },
        { id: "br-buchanan", name: "Buchanan" },
      ],
      employees,
    );
    expect(summary.branches[0].employees).toBe(16);
    expect(summary.branches[1].employees).toBe(16);
    expect(summary.branches[0].salaryMass).toBeCloseTo(16 * 1.44);
    expect(summary.branches[1].salaryMass).toBeCloseTo(16 * 1.44);
    expect(summary.unassigned).toBe(0);
  });

  it("counts NULL branch_id as Unassigned even if a leftover name is present", () => {
    const summary = aggregateByBranchId(
      [{ id: "br-bangli", name: "Bangli" }],
      [
        { branchId: "br-bangli", isActive: true, rate: 10 },
        { branchId: null, isActive: true, rate: 5 },
      ],
    );
    expect(summary.branches[0].employees).toBe(1);
    expect(summary.unassigned).toBe(1);
  });
});

describe("company isolation", () => {
  it("rejects assigning a foreign-company branch id", () => {
    const result = assignBranchFromOrg(COMPANY_A, FOREIGN.id, [BANGLI, FOREIGN]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/another company/i);
  });

  it("rejects a foreign id on the write helper", async () => {
    await expect(
      resolveEmployeeBranchWrite(
        COMPANY_A,
        { branchId: FOREIGN.id },
        {
          getById: async () => FOREIGN,
          listByCompany: async () => [BANGLI],
        },
      ),
    ).rejects.toThrow(/another company/i);
  });

  it("accepts a same-company id and stores the canonical name", async () => {
    const written = await resolveEmployeeBranchWrite(
      COMPANY_A,
      { branchId: BANGLI.id, branch: "bangli" },
      {
        getById: async () => BANGLI,
        listByCompany: async () => [BANGLI],
      },
    );
    expect(written).toEqual({ branch_id: BANGLI.id, branch: "Bangli" });
  });

  it("clears both fields for Unassigned", () => {
    expect(syncBranchAssignment({ branchId: null, branch: "" }, [{ id: BANGLI.id, name: BANGLI.name }]))
      .toEqual({ branchId: null, branch: "" });
  });
});

describe("payroll scope filter uses branchId when present", () => {
  it("filters by id and falls back to name only when id is missing", () => {
    const emps = [
      employee(),
      employee({ id: "e2", branchId: null, branch: "Bangli" }),
      employee({ id: "e3", branchId: "br-buchanan", branch: "Buchanan" }),
    ];
    expect(filterEmployeesForBranchScope(emps, "Bangli", { branchId: "br-bangli" })).toHaveLength(2);
    expect(filterEmployeesForBranchScope(emps, "Buchanan", { branchId: "br-buchanan" })).toHaveLength(1);
  });
});

describe("proxy does not rotate cookies on cookie-auth APIs", () => {
  it("keeps /api/org/units as a cookie-auth API but refreshes in the route, not the proxy", () => {
    expect(isCookieAuthApiPath("/api/org/units")).toBe(true);
    expect(shouldCreateSupabaseInProxy("/api/org/units")).toBe(false);
    expect(isCookieAuthApiPath("/api/org/branch-summary")).toBe(true);
    expect(shouldCreateSupabaseInProxy("/api/org/branch-summary")).toBe(false);
  });

  it("skips marketing, bearer APIs, cron, and demo handoff", () => {
    expect(shouldCreateSupabaseInProxy("/")).toBe(false);
    expect(isCookieAuthApiPath("/api/v1/employees")).toBe(false);
    expect(isCookieAuthApiPath("/api/demo/enter")).toBe(false);
    expect(isCookieAuthApiPath("/api/cron/expire")).toBe(false);
    expect(isCookieAuthApiPath("/api/faqs")).toBe(false);
    expect(shouldCreateSupabaseInProxy("/employees")).toBe(true);
  });
});

describe("interpretOrgUnitsListResponse", () => {
  it("does not expose items from a 401 body", () => {
    const interpreted = interpretOrgUnitsListResponse(401, {
      error: "Unauthorized",
      items: [{ id: "other-org", name: "ShouldNotLeak" }],
    });
    expect(interpreted.ok).toBe(false);
    if (interpreted.ok) return;
    expect(interpreted.error).toBe(orgUnitsFailureMessage(401, "Unauthorized"));
    expect(interpreted.error).not.toMatch(/is not registered/i);
    expect(interpreted.error).toMatch(/authentication failed|session/i);
  });

  it("returns company-scoped items only on 200", () => {
    const interpreted = interpretOrgUnitsListResponse(200, {
      items: [{ id: "br-sinkor", name: "Sinkor" }, { name: "NoId" }],
    });
    expect(interpreted).toEqual({
      ok: true,
      status: 200,
      items: [{ id: "br-sinkor", name: "Sinkor" }],
    });
  });

  it("maps 403 to org access and 404 to not found, never unregistered", () => {
    const forbidden = interpretOrgUnitsListResponse(403, { error: "Company not found" });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) {
      expect(forbidden.error).toMatch(/do not have access|company not found/i);
      expect(forbidden.error).not.toMatch(/is not registered/i);
    }
    const missing = interpretOrgUnitsListResponse(404, {});
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error).toMatch(/not found/i);
      expect(missing.error).not.toMatch(/is not registered/i);
    }
  });
});

describe("org units authorization", () => {
  it("returns 401 when there is no authenticated user", () => {
    expect(authorizeOrgUnitsAccess({ userId: null, companyId: "co-a" })).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
  });

  it("returns 403 when the user has no company membership", () => {
    expect(authorizeOrgUnitsAccess({ userId: "user-1", companyId: null })).toEqual({
      ok: false,
      status: 403,
      error: "Company not found",
    });
  });

  it("scopes branch lookup to the authenticated user's company only", () => {
    const allowed = authorizeOrgUnitsAccess({ userId: "user-1", companyId: COMPANY_A });
    expect(allowed).toEqual({ ok: true, companyId: COMPANY_A });
    if (!allowed.ok) return;
    expect(orgBranchListScope(allowed.companyId)).toEqual({
      table: "branches",
      companyId: COMPANY_A,
    });
    expect(orgBranchListScope(allowed.companyId).companyId).not.toBe(COMPANY_B);
  });
});

describe("createOrgBranchApi cookie credentials", () => {
  it("sends cookies on GET and POST so production session auth can succeed", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("kind=branches")) {
        return new Response(JSON.stringify({ items: [{ id: "br-sinkor", name: "Sinkor" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ item: { id: "br-bangli", name: "Bangli" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const api = createOrgBranchApi(fetchFn as unknown as typeof fetch);
    await api.list();
    await api.create("Bangli");
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/org/units?kind=branches",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/org/units",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("does not treat a 401 JSON body as an empty branch registry", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Unauthorized", items: [{ id: "other-org", name: "ShouldNotLeak" }] }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const api = createOrgBranchApi(fetchFn as unknown as typeof fetch);
    const listed = await api.list();
    expect(listed.status).toBe(401);
    expect(listed.items).toBeUndefined();
    const result = await ensureOrgBranchesForImport(["Sinkor", "Paynesville"], api);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/authentication failed|session/i);
      expect(result.error).not.toMatch(/is not registered/i);
    }
  });
});

describe("401/403 import errors are not unregistered-branch errors", () => {
  it("fails 403 org access without saying the branch is not registered", async () => {
    const result = await ensureOrgBranchesForImport(["Sinkor"], {
      list: async () => ({ status: 403, error: "Company not found", items: [] }),
      create: async () => {
        throw new Error("create should not run after 403");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/company not found/i);
      expect(result.error).not.toMatch(/is not registered/i);
    }
  });

  it("fails 404 without saying the branch is not registered", async () => {
    const result = await ensureOrgBranchesForImport(["Paynesville"], {
      list: async () => ({ status: 404, error: "Not found", items: [] }),
      create: async () => {
        throw new Error("create should not run after 404");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not found/i);
      expect(result.error).not.toMatch(/is not registered/i);
    }
  });
});
