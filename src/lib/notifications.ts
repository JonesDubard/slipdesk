/**
 * Slipdesk — Notification Center
 *
 * In-app notifications backed by the `notifications` table. Like audit logging,
 * every write is best-effort and non-blocking so a missing table (migration not
 * yet applied) or a transient error never breaks the triggering action.
 *
 * Email notifications: `emailNotification` posts to an existing/optional email
 * route; it degrades silently if the endpoint is not configured.
 */

import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type NotificationType =
  | "payroll_due"
  | "payroll_approved"
  | "payroll_completed"
  | "compliance_warning"
  | "tax_deadline"
  | "nasscorp_deadline"
  | "employee_added"
  | "general";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  severity: NotificationSeverity;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface CreateNotificationInput {
  companyId: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  severity?: NotificationSeverity;
  link?: string;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (!input.companyId) return;
  try {
    const supabase = createClient() as AnySupabase;
    const { error } = await supabase.from("notifications").insert({
      company_id: input.companyId,
      user_id: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      severity: input.severity ?? "info",
      link: input.link ?? null,
      is_read: false,
    });
    if (error) console.warn("[notifications] skipped:", error.message);
  } catch (err) {
    console.warn("[notifications] skipped:", err);
  }
}

export async function fetchNotifications(companyId: string, limit = 50): Promise<AppNotification[]> {
  if (!companyId) return [];
  try {
    const supabase = createClient() as AnySupabase;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      severity: r.severity,
      link: r.link,
      isRead: r.is_read,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    const supabase = createClient() as AnySupabase;
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  } catch {
    /* non-blocking */
  }
}

export async function markAllNotificationsRead(companyId: string): Promise<void> {
  if (!companyId) return;
  try {
    const supabase = createClient() as AnySupabase;
    await supabase.from("notifications").update({ is_read: true }).eq("company_id", companyId).eq("is_read", false);
  } catch {
    /* non-blocking */
  }
}

export interface EmailNotificationInput {
  to: string;
  subject: string;
  title: string;
  message?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  footer?: string;
}

/**
 * Fire-and-forget branded email via the /api/notifications/email route.
 * Never throws — email delivery must never break the triggering action, and it
 * silently no-ops if RESEND_API_KEY is not configured on the server.
 */
export async function sendEmailNotification(input: EmailNotificationInput): Promise<void> {
  if (!input.to) return;
  try {
    await fetch("/api/notifications/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    console.warn("[email] skipped:", err);
  }
}
