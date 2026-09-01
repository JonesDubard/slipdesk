import { describe, expect, it } from "vitest";
import { formatEmployeeFullName } from "@/lib/employee-name";

describe("formatEmployeeFullName", () => {
  it("joins first, middle, and last", () => {
    expect(formatEmployeeFullName("Moses", "Kollie", "James")).toBe("Moses James Kollie");
  });

  it("skips blank middle name", () => {
    expect(formatEmployeeFullName("Moses", "Kollie", "")).toBe("Moses Kollie");
    expect(formatEmployeeFullName("Moses", "Kollie", null)).toBe("Moses Kollie");
  });

  it("trims extra spaces", () => {
    expect(formatEmployeeFullName(" Moses ", " Kollie ", " James ")).toBe("Moses James Kollie");
  });
});
