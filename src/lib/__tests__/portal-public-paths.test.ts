import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
  }),
}));

import { proxy } from "@/proxy";

describe("signed-out portal paths", () => {
  it("returns /portal/login directly with no redirect", async () => {
    const res = await proxy(new NextRequest("http://localhost/portal/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not redirect /portal/forgot-password", async () => {
    const res = await proxy(new NextRequest("http://localhost/portal/forgot-password"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not redirect /portal/reset-password", async () => {
    const res = await proxy(new NextRequest("http://localhost/portal/reset-password?t=abc"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("still redirects /portal/payslips to login", async () => {
    const res = await proxy(new NextRequest("http://localhost/portal/payslips"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get("location")).toContain("/portal/login");
  });
});
