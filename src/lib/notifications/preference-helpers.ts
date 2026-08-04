/**
 * Pure helpers for notification preference / logging decisions — unit-testable
 * without a live database.
 */

import type { NotificationChannel, NotificationEventType, NotificationStatus } from "./types";

export function shouldSkipPayslipEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim();
  return !e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** password_reset email cannot be opted out when channel is email. */
export function resolvePreferenceEnabled(opts: {
  channel: NotificationChannel;
  eventType: NotificationEventType;
  storedEnabled: boolean | null;
  storedAvailable: boolean | null;
}): boolean {
  if (opts.channel !== "email") return false;
  if (opts.eventType === "password_reset") return true;
  if (opts.storedEnabled == null) return true;
  return Boolean(opts.storedAvailable !== false && opts.storedEnabled);
}

export function sanitizeNotificationMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const blocked = ["password", "passwordHash", "token", "apiKey", "secret"];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (blocked.some((b) => k.toLowerCase().includes(b.toLowerCase()))) continue;
    out[k] = v;
  }
  return out;
}

export function classifyDeliveryCounts(
  rows: Array<{ status: NotificationStatus }>,
): Record<NotificationStatus, number> {
  const counts: Record<NotificationStatus, number> = {
    pending: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    skipped: 0,
  };
  for (const r of rows) {
    if (r.status in counts) counts[r.status]++;
  }
  return counts;
}
