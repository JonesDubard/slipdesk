import { describe, expect, it } from "vitest";
import { isEmployeePortalPath } from "@/lib/auth/proxy-session";
import { isPublicPortalPath, runPortalGate } from "@/lib/employee-portal/portal-gate";

const publicPaths = ["/portal/login", "/portal/forgot-password", "/portal/reset-password"] as const;

describe("portal layout session gate", () => {
  it.each(publicPaths)("does not call /api/employee/me for %s", async (pathname) => {
    expect(isPublicPortalPath(pathname)).toBe(true);
    let called = false;
    const result = await runPortalGate({
      pathname,
      isChangePassword: false,
      fetchMe: async () => {
        called = true;
        return new Response("nope", { status: 500 });
      },
    });
    expect(result).toEqual({ action: "skip" });
    expect(called).toBe(false);
  });

  it("still treats /portal/login as a public path after the forgot-password exclusion", () => {
    expect(isEmployeePortalPath("/portal/login")).toBe(false);
    expect(isEmployeePortalPath("/portal/forgot-password")).toBe(false);
    expect(isEmployeePortalPath("/portal/reset-password")).toBe(false);
    expect(isEmployeePortalPath("/portal/payslips")).toBe(true);
  });

  it("clears a non-401 /api/employee/me failure within a bounded time", async () => {
    const started = Date.now();
    const hung = await runPortalGate({
      pathname: "/portal",
      isChangePassword: false,
      timeoutMs: 40,
      fetchMe: () => new Promise(() => {}),
    });
    const forbidden = await runPortalGate({
      pathname: "/portal/payslips",
      isChangePassword: false,
      fetchMe: async () => new Response(JSON.stringify({ error: "Employee portal session required." }), { status: 403 }),
    });
    expect(hung).toEqual({ action: "failed" });
    expect(forbidden).toEqual({ action: "failed" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("still sends a signed-out session to the login route", async () => {
    const result = await runPortalGate({
      pathname: "/portal/payslips",
      isChangePassword: false,
      fetchMe: async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    expect(result).toEqual({ action: "redirect-login" });
  });
});
