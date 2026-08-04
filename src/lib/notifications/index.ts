/**
 * Notification service public surface.
 * Business logic imports from here — never from providers/resend directly.
 */

export type {
  NotificationChannel,
  NotificationEventType,
  NotificationMessage,
  NotificationProvider,
  NotificationStatus,
  SendResult,
  TemplateKey,
} from "./types";

export {
  dispatch,
  sendTemplatedEmail,
  notifyPayslipsReady,
  requestPasswordResetByEmail,
  notifyPasswordChanged,
  retryNotification,
  validateAndConsumeToken,
  ensureDefaultEmailPreferences,
  isNotificationEnabled,
  isValidEmail,
  logNotification,
  notificationProviders,
  appUrl,
} from "./service";

export {
  notifyLeaveSubmitted,
  notifyLeaveApproved,
  notifyLeaveRejected,
  notifyLeaveInfoRequested,
  notifyAttendanceMissingClockout,
  notifyAttendanceCorrected,
} from "./leave-attendance-notify";

export { renderTemplate } from "./templates";
export {
  generateOpaqueToken,
  hashToken,
  isTokenExpired,
  tokenExpiresAt,
  PAYSLIP_LINK_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from "./tokens";
