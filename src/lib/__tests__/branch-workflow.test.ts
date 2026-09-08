import { describe, expect, it } from "vitest";
import type { Employee } from "@/context/AppContext";
import {
  ALL_BRANCH_FILTER,
  UNASSIGNED_BRANCH_FILTER,
  branchFilterOptions,
  employeeMatchesBranchFilter,
  employeeSalaryMass,
  resolveImportedBranch,
  summarizeRegisteredBranches,
} from "@/lib/org/branch-assignment";
import {
  EMPLOYEE_CSV_HEADERS,
  buildEmployeeCsvTemplate,
  parseEmployeeCSV,
} from "@/lib/employees/parse-employee-csv";

const BRANCHES = [
  { id: "b-sinkor", name: "Sinkor" },
  { id: "b-paynesville", name: "Paynesville" },
  { id: "b-congo", name: "Congo Town" },
];

const emp = (overrides: Partial<Employee> = {}): Employee => ({
  id: overrides.id ?? "e1",
  employeeNumber: overrides.employeeNumber ?? "EMP-1",
  firstName: overrides.firstName ?? "Ada",
  middleName: "",
  lastName: overrides.lastName ?? "Lovelace",
  fullName: overrides.fullName ?? "Ada Lovelace",
  jobTitle: "Staff",
  department: "Ops",
  email: "a@co.lr",
  phone: "",
  county: "Montserrado",
  startDate: "2024-01-01",
  employmentType: "full_time",
  currency: "USD",
  rate: overrides.rate ?? 1000,
  standardHours: 173.33,
  allowances: 0,
  nasscorpNumber: "",
  paymentMethod: "cash",
  bankName: "",
  accountNumber: "",
  momoNumber: "",
  isActive: overrides.isActive ?? true,
  isArchived: overrides.isArchived ?? false,
  branch: overrides.branch ?? "",
  gender: "female",
});

describe("CSV template includes Branch", () => {
  it("lists branch after department in the official template", () => {
    expect(EMPLOYEE_CSV_HEADERS).toContain("branch");
    expect(EMPLOYEE_CSV_HEADERS.indexOf("branch")).toBe(
      EMPLOYEE_CSV_HEADERS.indexOf("department") + 1,
    );
    const csv = buildEmployeeCsvTemplate();
    expect(csv.split("\n")[0]).toContain("branch");
    expect(csv).toMatch(/Sinkor/);
    expect(csv).toMatch(/Paynesville/);
  });
});

describe("CSV import branch resolution", () => {
  const csv = (rows: string[]) =>
    ["employee_number,first_name,last_name,currency,rate,branch", ...rows].join("\n");

  it("assigns matching branches across multiple rows", () => {
    const parsed = parseEmployeeCSV(
      csv([
        "EMP001,John,Doe,USD,10,Sinkor",
        "EMP002,Mary,Smith,USD,12,Paynesville",
      ]),
      BRANCHES,
    );
    expect(parsed[0].errors).toHaveLength(0);
    expect(parsed[0].data.branch).toBe("Sinkor");
    expect(parsed[1].data.branch).toBe("Paynesville");
  });

  it("trims whitespace and matches branch names case-insensitively", () => {
    const parsed = parseEmployeeCSV(
      csv(["EMP001,John,Doe,USD,10,  sinkor  "]),
      BRANCHES,
    );
    expect(parsed[0].errors).toHaveLength(0);
    expect(parsed[0].data.branch).toBe("Sinkor");
  });

  it("rejects an unknown branch instead of creating a new one", () => {
    const parsed = parseEmployeeCSV(
      csv(["EMP001,John,Doe,USD,10,Gbarnga"]),
      BRANCHES,
    );
    expect(parsed[0].errors.some((e) => /not registered/i.test(e))).toBe(true);
    expect(parsed[0].data.branch).toBe("");
  });

  it("imports a blank branch as Unassigned", () => {
    const parsed = parseEmployeeCSV(
      csv(["EMP001,John,Doe,USD,10,"]),
      BRANCHES,
    );
    expect(parsed[0].errors).toHaveLength(0);
    expect(parsed[0].data.branch).toBe("");
  });

  it("stores free-text when no branches are registered yet", () => {
    expect(resolveImportedBranch("Sinkor", [])).toEqual({
      status: "free_text",
      branchName: "Sinkor",
    });
  });
});

describe("Employee branch filtering", () => {
  const people = [
    emp({ id: "1", branch: "Sinkor" }),
    emp({ id: "2", branch: "  paynesville" }),
    emp({ id: "3", branch: "" }),
    emp({ id: "4", branch: "Legacy Office" }),
  ];

  it("shows everyone when no branch filter is set", () => {
    const shown = people.filter((e) =>
      employeeMatchesBranchFilter(e.branch, ALL_BRANCH_FILTER, BRANCHES),
    );
    expect(shown).toHaveLength(4);
  });

  it("filters Branch A case-insensitively", () => {
    const shown = people.filter((e) =>
      employeeMatchesBranchFilter(e.branch, "Sinkor", BRANCHES),
    );
    expect(shown.map((e) => e.id)).toEqual(["1"]);
  });

  it("filters Branch B including whitespace/case variants", () => {
    const shown = people.filter((e) =>
      employeeMatchesBranchFilter(e.branch, "Paynesville", BRANCHES),
    );
    expect(shown.map((e) => e.id)).toEqual(["2"]);
  });

  it("returns an empty list for a registered branch with zero employees", () => {
    const shown = people.filter((e) =>
      employeeMatchesBranchFilter(e.branch, "Congo Town", BRANCHES),
    );
    expect(shown).toHaveLength(0);
  });

  it("groups blank and unmatched names as Unassigned", () => {
    const shown = people.filter((e) =>
      employeeMatchesBranchFilter(e.branch, UNASSIGNED_BRANCH_FILTER, BRANCHES),
    );
    expect(shown.map((e) => e.id).sort()).toEqual(["3", "4"]);
  });

  it("lists registered branches even when they have no employees", () => {
    const options = branchFilterOptions(BRANCHES, [emp({ branch: "" })]);
    expect(options).toEqual([
      ALL_BRANCH_FILTER,
      UNASSIGNED_BRANCH_FILTER,
      "Congo Town",
      "Paynesville",
      "Sinkor",
    ]);
  });
});

describe("Organization branch statistics", () => {
  it("counts headcount and salary mass per branch from employee rates", () => {
    const employees = [
      emp({ id: "1", branch: "Sinkor", rate: 400 }),
      emp({ id: "2", branch: "sinkor", rate: 200 }),
      emp({ id: "3", branch: "Paynesville", rate: 150 }),
      emp({ id: "4", branch: "", rate: 90 }),
    ];
    const result = summarizeRegisteredBranches(BRANCHES, employees);
    const sinkor = result.branches.find((b) => b.name === "Sinkor");
    const paynesville = result.branches.find((b) => b.name === "Paynesville");
    const congo = result.branches.find((b) => b.name === "Congo Town");
    expect(sinkor?.employees).toBe(2);
    expect(sinkor?.salaryMass).toBe(600);
    expect(paynesville?.employees).toBe(1);
    expect(paynesville?.salaryMass).toBe(150);
    expect(congo?.employees).toBe(0);
    expect(congo?.salaryMass).toBe(0);
    expect(result.unassigned).toBe(1);
    expect(result.unassignedSalaryMass).toBe(90);
    expect(result.totalActive).toBe(4);
  });

  it("moves salary mass when an employee is reassigned", () => {
    const before = summarizeRegisteredBranches(BRANCHES, [
      emp({ id: "1", branch: "Sinkor", rate: 400 }),
    ]);
    const after = summarizeRegisteredBranches(BRANCHES, [
      emp({ id: "1", branch: "Paynesville", rate: 400 }),
    ]);
    expect(before.branches.find((b) => b.name === "Sinkor")?.employees).toBe(1);
    expect(after.branches.find((b) => b.name === "Sinkor")?.employees).toBe(0);
    expect(after.branches.find((b) => b.name === "Paynesville")?.salaryMass).toBe(400);
  });

  it("uses the employee rate as salary mass", () => {
    expect(employeeSalaryMass({ rate: 250 })).toBe(250);
    expect(employeeSalaryMass({ basic_salary: 0, rate: 80 })).toBe(80);
  });
});

describe("Imported branch stays consistent with filter and org stats", () => {
  it("uses the same canonical name from CSV through filter and headcount", () => {
    const parsed = parseEmployeeCSV(
      ["employee_number,first_name,last_name,currency,rate,branch", "EMP001,John,Doe,USD,42, SINKOR "].join("\n"),
      BRANCHES,
    );
    const imported = emp({ id: "imp", branch: parsed[0].data.branch, rate: 42 });
    expect(imported.branch).toBe("Sinkor");
    expect(employeeMatchesBranchFilter(imported.branch, "Sinkor", BRANCHES)).toBe(true);
    const stats = summarizeRegisteredBranches(BRANCHES, [imported]);
    expect(stats.branches.find((b) => b.name === "Sinkor")?.employees).toBe(1);
    expect(stats.branches.find((b) => b.name === "Sinkor")?.salaryMass).toBe(42);
  });
});
