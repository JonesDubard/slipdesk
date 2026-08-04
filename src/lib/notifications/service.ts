/**
 * NotificationService — single entry point for all outbound notifications.
 * Providers are swappable; preferences + logging are channel-agnostic.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  NotificationChannel,
  NotificationEventType,
  NotificationMessage,
  NotificationProvider,
  NotificationStatus,
  SendResult,
  TemplateKey,
} from "./types";
import {
  EmailProvider,
  PushProviderStub,
  SmsProviderStub,
  WhatsAppProviderStub,
} from "./providers/email";
import { renderTemplate, type Branding } from "./templates";
import {
  generateOpaqueToken,
  hashToken,
  PAYSLIP_LINK_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  tokenExpiresAt,
  isTokenExpired,
  type SecureTokenPurpose,
  type TokenValidation,
} from "./tokens";
import { resolvePreferenceEnabled } from "./preference-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const providers: NotificationProvider[] = [
  new EmailProvider(),
  new WhatsAppProviderStub(),
  new SmsProviderStub(),
  new PushProviderStub(),
];

function providerFor(channel: NotificationChannel): NotificationProvider | undefined {
  return providers.find((p) => p.channel === channel);
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function db(): AnyClient {
  return createAdminClient() as AnyClient;
}

export async function logNotification(entry: {
  companyId?: string | null;
  employeeId?: string | null;
  channel: NotificationChannel;
  provider: string;
  templateKey: string;
  eventType: string;
  recipient: string;
  status: NotificationStatus;
  attempt?: number;
  providerMessageId?: string | null;
  errorReason?: string | null;
  meta?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const { data, error } = await db()
      .from("notification_logs")
      .insert({
        company_id: entry.companyId ?? null,
        employee_id: entry.employeeId ?? null,
        channel: entry.channel,
        provider: entry.provider,
        template_key: entry.templateKey,
        event_type: entry.eventType,
        recipient: entry.recipient,
        status: entry.status,
        attempt: entry.attempt ?? 1,
        provider_message_id: entry.providerMessageId ?? null,
        error_reason: entry.errorReason ?? null,
        meta: entry.meta ?? {},
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[notification-log]", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.warn("[notification-log]", err);
    return null;
  }
}

export async function updateNotificationLog(
  id: string,
  patch: {
    status?: NotificationStatus;
    attempt?: number;
    providerMessageId?: string | null;
    errorReason?: string | null;
  },
): Promise<void> {
  try {
    await db()
      .from("notification_logs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
  } catch {
    // non-fatal
  }
}

/** Preference check — password_reset email cannot be disabled when email exists. */
export async function isNotificationEnabled(
  employeeId: string,
  channel: NotificationChannel,
  eventType: NotificationEventType,
): Promise<boolean> {
  if (channel !== "email") return false; // future channels off
  if (eventType === "password_reset") return true;

  const { data } = await db()
    .from("notification_preferences")
    .select("enabled, available")
    .eq("employee_id", employeeId)
    .eq("channel", channel)
    .eq("event_type", eventType)
    .maybeSingle();

  return resolvePreferenceEnabled({
    channel,
    eventType,
    storedEnabled: data ? Boolean(data.enabled) : null,
    storedAvailable: data ? Boolean(data.available) : null,
  });
}

export async function ensureDefaultEmailPreferences(
  employeeId: string,
  companyId: string,
): Promise<void> {
  const events: NotificationEventType[] = [
    "payslip_ready",
    "password_reset",
    "password_changed",
    "welcome",
    "leave_submitted",
    "leave_approved",
    "leave_rejected",
    "leave_info_requested",
    "attendance_missing_clockout",
    "attendance_corrected",
    "leave_balance_low",
    "leave_balance_exhausted",
    "attendance_auto_missing_clockout",
    "payroll_validation_warning",
  ];
  for (const eventType of events) {
    await db().from("notification_preferences").upsert(
      {
        employee_id: employeeId,
        company_id: companyId,
        channel: "email",
        event_type: eventType,
        enabled: true,
        available: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,channel,event_type" },
    );
  }
  // Placeholders for future channels (disabled)
  for (const channel of ["whatsapp", "sms", "push"] as NotificationChannel[]) {
    await db().from("notification_preferences").upsert(
      {
        employee_id: employeeId,
        company_id: companyId,
        channel,
        event_type: "payslip_ready",
        enabled: false,
        available: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,channel,event_type" },
    );
  }
}

async function createSecureToken(opts: {
  companyId: string;
  employeeId: string;
  purpose: SecureTokenPurpose;
  ttlMs: number;
  payslipId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = tokenExpiresAt(opts.ttlMs);
  await db().from("secure_tokens").insert({
    company_id: opts.companyId,
    employee_id: opts.employeeId,
    purpose: opts.purpose,
    token_hash: tokenHash,
    payslip_id: opts.payslipId ?? null,
    expires_at: expiresAt.toISOString(),
    meta: opts.meta ?? {},
  });
  return { token, expiresAt };
}

export async function validateAndConsumeToken(
  plaintext: string,
  purpose: SecureTokenPurpose,
): Promise<TokenValidation> {
  const tokenHash = hashToken(plaintext);
  const { data } = await db()
    .from("secure_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("purpose", purpose)
    .maybeSingle();

  if (!data) return { ok: false, reason: "invalid" };
  if (data.used_at) return { ok: false, reason: "used" };
  if (isTokenExpired(data.expires_at)) return { ok: false, reason: "expired" };

  await db()
    .from("secure_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    ok: true,
    record: {
      id: data.id,
      companyId: data.company_id,
      employeeId: data.employee_id,
      purpose: data.purpose,
      tokenHash: data.token_hash,
      payslipId: data.payslip_id,
      expiresAt: data.expires_at,
      usedAt: new Date().toISOString(),
    },
  };
}

async function touchEmployeeEmailStatus(
  employeeId: string,
  status: NotificationStatus,
): Promise<void> {
  await db()
    .from("employees")
    .update({
      last_email_at: new Date().toISOString(),
      last_email_status: status,
    })
    .eq("id", employeeId);
}

export async function dispatch(message: NotificationMessage): Promise<SendResult & { logId: string | null }> {
  const provider = providerFor(message.channel);
  if (!provider) {
    const logId = await logNotification({
      ...message,
      provider: "none",
      status: "failed",
      errorReason: `No provider for channel ${message.channel}`,
    });
    return { ok: false, status: "failed", errorReason: "No provider", logId };
  }

  const enabled = await isNotificationEnabled(
    message.employeeId,
    message.channel,
    message.eventType,
  );
  if (!enabled) {
    const logId = await logNotification({
      companyId: message.companyId,
      employeeId: message.employeeId,
      channel: message.channel,
      provider: provider.providerId,
      templateKey: message.templateKey,
      eventType: message.eventType,
      recipient: message.recipient,
      status: "skipped",
      errorReason: "Preference disabled",
      meta: message.meta,
    });
    return { ok: false, status: "skipped", skippedReason: "Preference disabled", logId };
  }

  const logId = await logNotification({
    companyId: message.companyId,
    employeeId: message.employeeId,
    channel: message.channel,
    provider: provider.providerId,
    templateKey: message.templateKey,
    eventType: message.eventType,
    recipient: message.recipient,
    status: "pending",
    meta: message.meta,
  });

  const result = await provider.send(message);

  if (logId) {
    await updateNotificationLog(logId, {
      status: result.status,
      providerMessageId: result.providerMessageId,
      errorReason: result.errorReason ?? result.skippedReason ?? null,
    });
  }

  if (message.channel === "email") {
    await touchEmployeeEmailStatus(message.employeeId, result.status);
  }

  return { ...result, logId };
}

export async function sendTemplatedEmail(opts: {
  employeeId: string;
  companyId: string;
  recipient: string;
  templateKey: TemplateKey;
  eventType: NotificationEventType;
  vars: {
    employeeName: string;
    companyName: string;
    periodLabel?: string;
    ctaUrl?: string;
    ctaLabel?: string;
    branding?: Branding;
    leaveType?: string;
    leaveDates?: string;
    leaveDays?: string;
    hrNote?: string;
    workDate?: string;
    hoursWorked?: string;
    remaining?: string;
    validationSummary?: string;
  };
  meta?: Record<string, unknown>;
}): Promise<SendResult & { logId: string | null }> {
  const rendered = renderTemplate(opts.templateKey, opts.vars);
  return dispatch({
    channel: "email",
    eventType: opts.eventType,
    templateKey: opts.templateKey,
    companyId: opts.companyId,
    employeeId: opts.employeeId,
    recipient: opts.recipient.trim().toLowerCase(),
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    meta: opts.meta,
  });
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? "").trim());
}

/**
 * Send payslip-ready emails (no PDF). Creates single-use 24h access links.
 */
export async function notifyPayslipsReady(opts: {
  companyId: string;
  companyName: string;
  periodLabel: string;
  branding?: Branding;
  employees: Array<{
    id: string;
    email: string | null | undefined;
    fullName: string;
    payslipLineId: string;
  }>;
}): Promise<{ sent: number; skipped: number; failed: number }> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const emp of opts.employees) {
    const email = (emp.email ?? "").trim();
    if (!email || !isValidEmail(email)) {
      skipped++;
      await logNotification({
        companyId: opts.companyId,
        employeeId: emp.id,
        channel: "email",
        provider: "resend",
        templateKey: "payslip_ready",
        eventType: "payslip_ready",
        recipient: email || "(none)",
        status: "skipped",
        errorReason: "No valid email on file",
        meta: { periodLabel: opts.periodLabel },
      });
      continue;
    }

    await ensureDefaultEmailPreferences(emp.id, opts.companyId);

    const { token } = await createSecureToken({
      companyId: opts.companyId,
      employeeId: emp.id,
      purpose: "payslip_access",
      ttlMs: PAYSLIP_LINK_TTL_MS,
      payslipId: emp.payslipLineId,
      meta: { periodLabel: opts.periodLabel },
    });

    const ctaUrl = `${appUrl()}/api/notifications/payslip-access?t=${encodeURIComponent(token)}`;
    const result = await sendTemplatedEmail({
      employeeId: emp.id,
      companyId: opts.companyId,
      recipient: email,
      templateKey: "payslip_ready",
      eventType: "payslip_ready",
      vars: {
        employeeName: emp.fullName,
        companyName: opts.companyName,
        periodLabel: opts.periodLabel,
        ctaUrl,
        ctaLabel: "View Payslip",
        branding: opts.branding,
      },
      meta: { periodLabel: opts.periodLabel, payslipId: emp.payslipLineId },
    });

    if (result.status === "sent") sent++;
    else if (result.status === "skipped") skipped++;
    else failed++;
  }

  return { sent, skipped, failed };
}

/**
 * Password reset via email. Always returns generic success to callers (no enumeration).
 * Returns whether an email was actually queued for internal use only.
 */
export async function requestPasswordResetByEmail(emailInput: string): Promise<{
  accepted: true;
  emailed: boolean;
}> {
  const email = emailInput.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { accepted: true, emailed: false };
  }

  const { data: emp } = await db()
    .from("employees")
    .select("id, company_id, full_name, email, portal_enabled, is_active, is_archived")
    .ilike("email", email)
    .eq("is_active", true)
    .eq("is_archived", false)
    .eq("portal_enabled", true)
    .limit(1)
    .maybeSingle();

  if (!emp) {
    return { accepted: true, emailed: false };
  }

  const { data: company } = await db()
    .from("companies")
    .select("name, logo_url, brand_primary_color, brand_secondary_color, email_footer")
    .eq("id", emp.company_id)
    .maybeSingle();

  await ensureDefaultEmailPreferences(emp.id, emp.company_id);

  const { token } = await createSecureToken({
    companyId: emp.company_id,
    employeeId: emp.id,
    purpose: "password_reset",
    ttlMs: PASSWORD_RESET_TTL_MS,
  });

  const ctaUrl = `${appUrl()}/portal/reset-password?t=${encodeURIComponent(token)}`;
  const result = await sendTemplatedEmail({
    employeeId: emp.id,
    companyId: emp.company_id,
    recipient: email,
    templateKey: "password_reset",
    eventType: "password_reset",
    vars: {
      employeeName: emp.full_name,
      companyName: company?.name ?? "your company",
      ctaUrl,
      ctaLabel: "Choose a new password",
      branding: {
        companyName: company?.name ?? "Slipdesk",
        logoUrl: company?.logo_url,
        primaryColor: company?.brand_primary_color,
        secondaryColor: company?.brand_secondary_color,
        footer: company?.email_footer,
      },
    },
  });

  return { accepted: true, emailed: result.status === "sent" };
}

export async function notifyPasswordChanged(opts: {
  employeeId: string;
  companyId: string;
  email: string;
  fullName: string;
  companyName: string;
  branding?: Branding;
}): Promise<void> {
  if (!isValidEmail(opts.email)) return;
  await sendTemplatedEmail({
    employeeId: opts.employeeId,
    companyId: opts.companyId,
    recipient: opts.email,
    templateKey: "password_changed",
    eventType: "password_changed",
    vars: {
      employeeName: opts.fullName,
      companyName: opts.companyName,
      ctaUrl: `${appUrl()}/portal/login`,
      ctaLabel: "Sign in",
      branding: opts.branding,
    },
  });
}

export async function retryNotification(logId: string): Promise<SendResult & { logId: string | null }> {
  const { data: row } = await db().from("notification_logs").select("*").eq("id", logId).maybeSingle();
  if (!row) return { ok: false, status: "failed", errorReason: "Log not found", logId: null };
  if (row.channel !== "email") {
    return { ok: false, status: "skipped", skippedReason: "Only email retries supported", logId };
  }

  // Re-send using stored meta — only for payslip_ready with payslip id, or simple templates
  const { data: emp } = await db()
    .from("employees")
    .select("id, full_name, email, company_id")
    .eq("id", row.employee_id)
    .maybeSingle();
  if (!emp?.email) {
    return { ok: false, status: "failed", errorReason: "Employee email missing", logId };
  }

  const { data: company } = await db()
    .from("companies")
    .select("name, logo_url, brand_primary_color, brand_secondary_color, email_footer")
    .eq("id", row.company_id)
    .maybeSingle();

  const attempt = (row.attempt ?? 1) + 1;
  await updateNotificationLog(logId, { status: "pending", attempt });

  let ctaUrl = `${appUrl()}/portal/login`;
  if (row.template_key === "payslip_ready" && row.meta?.payslipId) {
    const { token } = await createSecureToken({
      companyId: row.company_id,
      employeeId: emp.id,
      purpose: "payslip_access",
      ttlMs: PAYSLIP_LINK_TTL_MS,
      payslipId: String(row.meta.payslipId),
    });
    ctaUrl = `${appUrl()}/api/notifications/payslip-access?t=${encodeURIComponent(token)}`;
  }

  const rendered = renderTemplate(row.template_key, {
    employeeName: emp.full_name,
    companyName: company?.name ?? "your company",
    periodLabel: row.meta?.periodLabel ? String(row.meta.periodLabel) : undefined,
    ctaUrl,
    branding: {
      companyName: company?.name ?? "Slipdesk",
      logoUrl: company?.logo_url,
      primaryColor: company?.brand_primary_color,
      secondaryColor: company?.brand_secondary_color,
      footer: company?.email_footer,
    },
  });

  const provider = providerFor("email")!;
  const result = await provider.send({
    channel: "email",
    eventType: row.event_type,
    templateKey: row.template_key,
    companyId: row.company_id,
    employeeId: emp.id,
    recipient: emp.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  await updateNotificationLog(logId, {
    status: result.status,
    attempt,
    providerMessageId: result.providerMessageId,
    errorReason: result.errorReason ?? result.skippedReason ?? null,
  });
  await touchEmployeeEmailStatus(emp.id, result.status);

  return { ...result, logId };
}

export { appUrl, providers as notificationProviders };
