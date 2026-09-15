import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEmployeeCSV } from "@/lib/csv/parse-employee-csv";
import {
  applyEnsuredBranch,
  ensureOrgBranchesForImport,
  previewEmployeeCsvRows,
  unregisteredBranchMessage,
} from "@/lib/csv/resolve-branch";
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
