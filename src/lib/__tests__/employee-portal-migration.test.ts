/**
 * Migration contract checks for 0010–0012 portal schema.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "../../../supabase/migrations");
const up10 = path.join(root, "0010_employee_self_service.sql");
const down10 = path.join(root, "0010_employee_self_service_down.sql");
const up11 = path.join(root, "0011_portal_hardening.sql");
const down11 = path.join(root, "0011_portal_hardening_down.sql");
const up12 = path.join(root, "0012_employee_password_auth.sql");
const down12 = path.join(root, "0012_employee_password_auth_down.sql");

describe("migration 0010 employee self-service", () => {
  it("provides apply and rollback scripts", () => {
    expect(existsSync(up10)).toBe(true);
    expect(existsSync(down10)).toBe(true);
  });

  it("creates change-request tables and portal columns on apply", () => {
    const sql = readFileSync(up10, "utf8");
    expect(sql).toMatch(/employee_change_requests/);
    expect(sql).toMatch(/add column if not exists user_id/);
    expect(sql).toMatch(/my_employee_id/);
  });
});

describe("migration 0011 portal hardening", () => {
  it("adds portal opt-in and staff/self RLS", () => {
    expect(existsSync(up11)).toBe(true);
    const sql = readFileSync(up11, "utf8");
    expect(sql).toMatch(/portal_enabled/);
    expect(sql).toMatch(/is_company_staff/);
  });

  it("rollback removes hardening objects", () => {
    const sql = readFileSync(down11, "utf8");
    expect(sql).toMatch(/drop column if exists portal_enabled/);
  });
});

describe("migration 0012 employee password auth", () => {
  it("provides apply and rollback scripts", () => {
    expect(existsSync(up12)).toBe(true);
    expect(existsSync(down12)).toBe(true);
  });

  it("creates hashed credential store (no plaintext column)", () => {
    const sql = readFileSync(up12, "utf8");
    expect(sql).toMatch(/employee_credentials/);
    expect(sql).toMatch(/password_hash/);
    expect(sql).toMatch(/must_change_password/);
    expect(sql).not.toMatch(/password_plain/);
    expect(sql).not.toMatch(/temporary_password text/);
    expect(sql).toMatch(/employee_auth_events/);
  });

  it("rollback drops credential tables", () => {
    const sql = readFileSync(down12, "utf8");
    expect(sql).toMatch(/drop table if exists public\.employee_credentials/);
    expect(sql).toMatch(/drop table if exists public\.employee_auth_events/);
  });
});
