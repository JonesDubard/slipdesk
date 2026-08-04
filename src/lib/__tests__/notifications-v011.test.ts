import { describe, it, expect } from "vitest";
import {
  generateOpaqueToken,
  hashToken,
  isTokenExpired,
  tokenExpiresAt,
  PAYSLIP_LINK_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from "@/lib/notifications/tokens";
import { renderTemplate } from "@/lib/notifications/templates";
import { isValidEmail } from "@/lib/notifications/service";
import {
  EmailProvider,
  WhatsAppProviderStub,
  SmsProviderStub,
  PushProviderStub,
} from "@/lib/notifications/providers/email";

describe("secure tokens", () => {
  it("generates opaque tokens that do not expose employee IDs", () => {
    const t = generateOpaqueToken();
    expect(t.length).toBeGreaterThan(20);
    expect(t).not.toMatch(/emp-|employee/i);
    expect(hashToken(t)).toHaveLength(64);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(hashToken(t + "x"));
  });

  it("payslip links expire after 24h; reset after 1h", () => {
    const now = Date.parse("2026-08-04T12:00:00.000Z");
    const payslipExp = tokenExpiresAt(PAYSLIP_LINK_TTL_MS, now);
    const resetExp = tokenExpiresAt(PASSWORD_RESET_TTL_MS, now);
    expect(isTokenExpired(payslipExp, now)).toBe(false);
    expect(isTokenExpired(payslipExp, now + PAYSLIP_LINK_TTL_MS + 1)).toBe(true);
    expect(isTokenExpired(resetExp, now + PASSWORD_RESET_TTL_MS + 1)).toBe(true);
    expect(isTokenExpired("2000-01-01T00:00:00.000Z", now)).toBe(true);
  });

  it("models single-use: used_at present ⇒ reject", () => {
    // Mirrors validateAndConsumeToken branching (unit-level)
    const usedAt: string | null = "2026-08-04T12:01:00.000Z";
    const expiresAt = tokenExpiresAt(PAYSLIP_LINK_TTL_MS).toISOString();
    const reason =
      !hashToken("x") ? "invalid"
        : usedAt ? "used"
          : isTokenExpired(expiresAt) ? "expired"
            : "ok";
    expect(reason).toBe("used");
  });
});

describe("email validation", () => {
  it("validates addresses", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});

describe("email templates", () => {
  const branding = {
    companyName: "Jones Logistics",
    logoUrl: "https://example.com/logo.png",
    primaryColor: "#002147",
    secondaryColor: "#50C878",
  };

  it("renders payslip ready with required subject and CTA (no secrets in HTML)", () => {
    const r = renderTemplate("payslip_ready", {
      employeeName: "Ada Lovelace",
      companyName: "Jones Logistics",
      periodLabel: "July 2026",
      ctaUrl: "https://app.example/api/notifications/payslip-access?t=opaque-token",
      ctaLabel: "View Payslip",
      branding,
    });
    expect(r.subject).toBe("Your Slipdesk Payslip is Ready");
    expect(r.html).toContain("Ada Lovelace");
    expect(r.html).toContain("July 2026");
    expect(r.html).toContain("Jones Logistics");
    expect(r.html).toContain("View Payslip");
    expect(r.html).toContain("viewport");
    expect(r.html).not.toContain("password");
    expect(r.html).not.toContain("<script");
    expect(r.html).not.toMatch(/employee_id|emp-/i);
  });

  it("renders welcome, password reset, and password changed", () => {
    for (const key of ["welcome", "password_reset", "password_changed"] as const) {
      const r = renderTemplate(key, {
        employeeName: "Ada",
        companyName: "Jones Logistics",
        ctaUrl: "https://app.example/portal/login",
        branding,
      });
      expect(r.subject.length).toBeGreaterThan(5);
      expect(r.html).toContain("Ada");
      expect(r.text.length).toBeGreaterThan(5);
    }
  });
});

describe("notification providers", () => {
  it("only EmailProvider becomes available with RESEND_API_KEY", () => {
    const prev = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "re_test";
    expect(new EmailProvider().isAvailable()).toBe(true);
    expect(new WhatsAppProviderStub().isAvailable()).toBe(false);
    expect(new SmsProviderStub().isAvailable()).toBe(false);
    expect(new PushProviderStub().isAvailable()).toBe(false);
    process.env.RESEND_API_KEY = prev;
  });

  it("EmailProvider skips when API key missing", async () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const result = await new EmailProvider().send({
      channel: "email",
      eventType: "payslip_ready",
      templateKey: "payslip_ready",
      companyId: "c1",
      employeeId: "e1",
      recipient: "a@b.co",
      subject: "Test",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(result.status).toBe("skipped");
    process.env.RESEND_API_KEY = prev;
  });

  it("rejects invalid recipient without calling Resend", async () => {
    const prev = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "re_test";
    const result = await new EmailProvider().send({
      channel: "email",
      eventType: "payslip_ready",
      templateKey: "payslip_ready",
      companyId: "c1",
      employeeId: "e1",
      recipient: "not-email",
      subject: "Test",
      html: "<p>Hi</p>",
    });
    expect(result.status).toBe("failed");
    expect(result.errorReason).toMatch(/invalid/i);
    process.env.RESEND_API_KEY = prev;
  });

  it("future channel stubs always skip (no business-logic change needed later)", async () => {
    for (const p of [new WhatsAppProviderStub(), new SmsProviderStub(), new PushProviderStub()]) {
      const r = await p.send({
        channel: p.channel,
        eventType: "payslip_ready",
        templateKey: "payslip_ready",
        companyId: "c",
        employeeId: "e",
        recipient: "+231",
        subject: "x",
      } as Parameters<typeof p.send>[0]);
      expect(r.status).toBe("skipped");
    }
  });
});

describe("password reset enumeration safety", () => {
  it("invalid email shape still returns accepted:true without sending", async () => {
    const { requestPasswordResetByEmail } = await import("@/lib/notifications/service");
    const r = await requestPasswordResetByEmail("not-valid");
    expect(r.accepted).toBe(true);
    expect(r.emailed).toBe(false);
  });
});

describe("signed URL shape", () => {
  it("payslip access URLs carry only opaque token (no employee id)", () => {
    const token = generateOpaqueToken();
    const url = `https://app.example/api/notifications/payslip-access?t=${encodeURIComponent(token)}`;
    expect(url).not.toMatch(/employee/i);
    expect(url).toContain("t=");
    expect(decodeURIComponent(new URL(url).searchParams.get("t")!)).toBe(token);
  });
});

describe("preference helpers", () => {
  it("skips employees without valid email", async () => {
    const { shouldSkipPayslipEmail, resolvePreferenceEnabled, sanitizeNotificationMeta, classifyDeliveryCounts } =
      await import("@/lib/notifications/preference-helpers");
    expect(shouldSkipPayslipEmail(null)).toBe(true);
    expect(shouldSkipPayslipEmail("")).toBe(true);
    expect(shouldSkipPayslipEmail("ada@jones.lr")).toBe(false);

    expect(resolvePreferenceEnabled({
      channel: "email", eventType: "payslip_ready", storedEnabled: false, storedAvailable: true,
    })).toBe(false);
    expect(resolvePreferenceEnabled({
      channel: "email", eventType: "password_reset", storedEnabled: false, storedAvailable: true,
    })).toBe(true);
    expect(resolvePreferenceEnabled({
      channel: "whatsapp", eventType: "payslip_ready", storedEnabled: true, storedAvailable: true,
    })).toBe(false);

    expect(sanitizeNotificationMeta({ periodLabel: "Aug", password: "secret", token: "x" })).toEqual({
      periodLabel: "Aug",
    });

    expect(classifyDeliveryCounts([
      { status: "sent" }, { status: "failed" }, { status: "sent" }, { status: "skipped" },
    ])).toMatchObject({ sent: 2, failed: 1, skipped: 1, pending: 0 });
  });
});
