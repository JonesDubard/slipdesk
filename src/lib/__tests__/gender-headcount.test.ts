import { describe, expect, it } from "vitest";
import type { Employee } from "@/context/AppContext";
import {
  bucketGender,
  buildGenderHeadcountCsv,
  employeesForGenderExport,
  genderByBranchExportRows,
  genderDetailExportRows,
  genderHeadcountByBranch,
  genderHeadcountLabel,
  genderSummaryExportRows,
  summarizeGenderHeadcount,
} from "@/lib/reports/gender-headcount";

const emp = (overrides: Partial<Employee> = {}): Employee => ({
  id: overrides.id ?? "e1",
  employeeNumber: overrides.employeeNumber ?? "EMP-1",
  firstName: overrides.firstName ?? "Ada",
  middleName: overrides.middleName ?? "",
  lastName: overrides.lastName ?? "Lovelace",
  fullName: overrides.fullName ?? "Ada Lovelace",
  jobTitle: "Staff",
  department: overrides.department ?? "Ops",
  email: "a@co.lr",
  phone: "",
  county: "Montserrado",
  startDate: "2024-01-01",
  employmentType: "full_time",
  currency: "USD",
  rate: 10,
  standardHours: 173.33,
  allowances: 0,
  nasscorpNumber: "",
  paymentMethod: "cash",
  bankName: "",
  accountNumber: "",
  momoNumber: "",
  isActive: true,
  isArchived: false,
  branch: overrides.branch ?? "Monrovia",
  gender: overrides.gender ?? "female",
});

describe("gender headcount aggregation", () => {
  it("counts every stored gender plus unspecified", () => {
    const rows = summarizeGenderHeadcount([
      emp({ id: "1", gender: "male" }),
      emp({ id: "2", gender: "female" }),
      emp({ id: "3", gender: "female" }),
      emp({ id: "4", gender: "other" }),
      emp({ id: "5", gender: "prefer_not_to_say" }),
      emp({ id: "6", gender: "" }),
    ]);
    expect(rows.find((r) => r.key === "male")?.count).toBe(1);
    expect(rows.find((r) => r.key === "female")?.count).toBe(2);
    expect(rows.find((r) => r.key === "other")?.count).toBe(1);
    expect(rows.find((r) => r.key === "prefer_not_to_say")?.count).toBe(1);
    expect(rows.find((r) => r.key === "")?.count).toBe(1);
    expect(rows.find((r) => r.key === "female")?.percent).toBe(33.3);
  });

  it("buckets unknown stored values as unspecified without changing gender.ts", () => {
    expect(bucketGender("male")).toBe("male");
    expect(bucketGender("  ")).toBe("");
    expect(bucketGender("mystery")).toBe("");
    expect(genderHeadcountLabel("prefer_not_to_say")).toBe("Prefer not to say");
  });

  it("splits counts by branch for consolidated export", () => {
    const groups = genderHeadcountByBranch([
      emp({ id: "1", gender: "male", branch: "Monrovia" }),
      emp({ id: "2", gender: "female", branch: "Buchanan" }),
      emp({ id: "3", gender: "female", branch: "Buchanan" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.branch === "Buchanan")?.total).toBe(2);
    expect(groups.find((g) => g.branch === "Monrovia")?.rows.find((r) => r.key === "male")?.count).toBe(1);
  });

  it("builds summary, detail, and by-branch export rows", () => {
    const people = [
      emp({ id: "1", employeeNumber: "EMP-1", fullName: "Ada Lovelace", gender: "female", branch: "Monrovia" }),
      emp({ id: "2", employeeNumber: "EMP-2", fullName: "Ben Doe", gender: "male", branch: "Buchanan" }),
    ];
    const summary = summarizeGenderHeadcount(people);
    expect(genderSummaryExportRows(summary, people.length).at(-1)?.[0]).toBe("Total");
    expect(genderDetailExportRows(people)[0][1]).toBe("Ada Lovelace");
    const byBranch = genderByBranchExportRows(genderHeadcountByBranch(people));
    expect(byBranch.some((r) => r[0] === "Buchanan" && r[1] === "Male")).toBe(true);
  });

  it("resolves current view, consolidated, and named-branch export scopes", () => {
    const monrovia = emp({ id: "1", gender: "female", branch: "Monrovia" });
    const buchanan = emp({ id: "2", gender: "male", branch: "Buchanan" });
    const all = [monrovia, buchanan];
    expect(employeesForGenderExport("view", [monrovia], all)).toEqual([monrovia]);
    expect(employeesForGenderExport("all", [monrovia], all)).toEqual(all);
    expect(employeesForGenderExport("branch:Buchanan", [monrovia], all)).toEqual([buchanan]);
    const csv = buildGenderHeadcountCsv({
      scopeLabel: "All branches (consolidated)",
      employees: all,
      includeByBranch: true,
    });
    expect(csv.rows.some((r) => r[0] === "By branch")).toBe(true);
    expect(csv.rows.some((r) => r[0] === "not a certified labor filing format" || String(r[0]).includes("not a certified"))).toBe(true);
  });
});
