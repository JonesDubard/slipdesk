/**
 * Notification channel abstraction.
 * Business logic calls NotificationService only — never Resend / WhatsApp / SMS directly.
 *
 * v0.1.1: EmailProvider (Resend) implemented.
 * Future: WhatsAppProvider, SmsProvider, PushProvider registered the same way.
 */

export type NotificationChannel = "email" | "whatsapp" | "sms" | "push";

export type NotificationEventType =
  | "payslip_ready"
  | "password_reset"
  | "password_changed"
  | "welcome"
  | "leave_submitted"
  | "leave_approved"
  | "leave_rejected"
  | "leave_info_requested"
  | "attendance_missing_clockout"
  | "attendance_corrected"
  | "leave_balance_low"
  | "leave_balance_exhausted"
  | "attendance_auto_missing_clockout"
  | "payroll_validation_warning";

export type TemplateKey =
  | "welcome"
  | "payslip_ready"
  | "password_reset"
  | "password_changed"
  | "leave_submitted"
  | "leave_approved"
  | "leave_rejected"
  | "leave_info_requested"
  | "attendance_missing_clockout"
  | "attendance_corrected"
  | "leave_balance_low"
  | "leave_balance_exhausted"
  | "attendance_auto_missing_clockout"
  | "payroll_validation_warning";

export type NotificationStatus = "pending" | "sent" | "delivered" | "failed" | "skipped";

export type NotificationMessage = {
  channel: NotificationChannel;
  eventType: NotificationEventType;
  templateKey: TemplateKey;
  companyId: string;
  employeeId: string;
  /** Destination for the channel (email address today). Never passwords. */
  recipient: string;
  subject: string;
  /** Pre-rendered HTML for email; future channels may use text/body fields. */
  html?: string;
  text?: string;
  meta?: Record<string, unknown>;
};

export type SendResult = {
  ok: boolean;
  status: NotificationStatus;
  providerMessageId?: string | null;
  errorReason?: string | null;
  skippedReason?: string | null;
};

/**
 * Pluggable provider. Implementations must not log secrets.
 */
export interface NotificationProvider {
  readonly channel: NotificationChannel;
  readonly providerId: string;
  /** Whether this provider is configured and ready (e.g. API key present). */
  isAvailable(): boolean;
  send(message: NotificationMessage): Promise<SendResult>;
}
