/**
 * Fire-and-forget auth telemetry — never stores plaintext passwords.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type EmployeeAuthEventType =
  | "login_ok"
  | "login_fail"
  | "login_lockout"
  | "password_changed"
  | "password_assigned"
  | "password_reset"
  | "portal_disabled";

export async function logEmployeeAuthEvent(
  admin: AnyClient,
  event: {
    employeeId?: string | null;
    companyId?: string | null;
    eventType: EmployeeAuthEventType;
    actorId?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("employee_auth_events").insert({
      employee_id: event.employeeId ?? null,
      company_id: event.companyId ?? null,
      event_type: event.eventType,
      actor_id: event.actorId ?? null,
      meta: event.meta ?? {},
    });
  } catch (err) {
    console.warn("[employee-auth] telemetry skipped:", err);
  }
}
