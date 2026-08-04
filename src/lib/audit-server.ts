/**
 * Server-side audit logging (service role or user-scoped server client).
 * Never throws — audit must not break the primary action.
 */

import type { AuditAction } from "@/lib/audit";

export type ServerAuditEntry = {
  companyId: string;
  action: AuditAction | string;
  entityType?: string;
  entityId?: string;
  actorId?: string | null;
  actorEmail?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logAuditServer(client: any, entry: ServerAuditEntry): Promise<void> {
  if (!entry.companyId) return;
  try {
    const { error } = await client.from("audit_log").insert({
      company_id: entry.companyId,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      ip_address: entry.ipAddress ?? null,
    });
    if (error) console.warn("[audit-server] skipped:", error.message);
  } catch (err) {
    console.warn("[audit-server] skipped:", err);
  }
}
