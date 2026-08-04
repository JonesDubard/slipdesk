/**
 * Employee change-request domain — requests never auto-apply.
 */

export type ChangeRequestFieldType = "address" | "bank_details" | "phone";
export type ChangeRequestStatus = "pending" | "approved" | "rejected";

export type BankDetailsValue = {
  paymentMethod?: string;
  bankName?: string;
  accountNumber?: string;
  bankBranch?: string;
  momoNumber?: string;
};

export type ChangeRequestPayload = {
  fieldType: ChangeRequestFieldType;
  newValue: Record<string, unknown>;
};

export type ChangeRequestRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  requestedBy: string | null;
  fieldType: ChangeRequestFieldType;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  status: ChangeRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

const FIELD_TYPES: ChangeRequestFieldType[] = ["address", "bank_details", "phone"];

export function isChangeRequestFieldType(v: unknown): v is ChangeRequestFieldType {
  return typeof v === "string" && FIELD_TYPES.includes(v as ChangeRequestFieldType);
}

export function validateChangeRequestPayload(
  fieldType: ChangeRequestFieldType,
  newValue: Record<string, unknown>,
): string | null {
  if (fieldType === "address") {
    const address = String(newValue.address ?? "").trim();
    if (address.length < 5) return "Address must be at least 5 characters.";
    return null;
  }
  if (fieldType === "phone") {
    const phone = String(newValue.phone ?? "").trim();
    if (phone.length < 7) return "Enter a valid phone number.";
    return null;
  }
  // bank_details
  const method = String(newValue.paymentMethod ?? "").trim();
  if (!method) return "Payment method is required.";
  if (method === "bank_transfer") {
    if (!String(newValue.bankName ?? "").trim()) return "Bank name is required.";
    if (!String(newValue.accountNumber ?? "").trim()) return "Account number is required.";
  }
  if (method === "mtn_momo" || method === "orange_money") {
    if (!String(newValue.momoNumber ?? "").trim()) return "Mobile money number is required.";
  }
  return null;
}

/** Snapshot current employee fields for the audit old_value. */
export function snapshotOldValue(
  fieldType: ChangeRequestFieldType,
  employee: {
    address?: string;
    phone?: string;
    paymentMethod?: string;
    bankName?: string;
    accountNumber?: string;
    bankBranch?: string;
    momoNumber?: string;
  },
): Record<string, unknown> {
  if (fieldType === "address") return { address: employee.address ?? "" };
  if (fieldType === "phone") return { phone: employee.phone ?? "" };
  return {
    paymentMethod: employee.paymentMethod ?? "",
    bankName: employee.bankName ?? "",
    accountNumber: employee.accountNumber ?? "",
    bankBranch: employee.bankBranch ?? "",
    momoNumber: employee.momoNumber ?? "",
  };
}

/** Map an approved request into an employees table patch. Never call without HR approval. */
export function approvedPatchFromRequest(
  fieldType: ChangeRequestFieldType,
  newValue: Record<string, unknown>,
  phoneE164?: string | null,
): Record<string, unknown> {
  if (fieldType === "address") {
    return { address: String(newValue.address ?? "").trim() };
  }
  if (fieldType === "phone") {
    const phone = String(newValue.phone ?? "").trim();
    return {
      phone,
      ...(phoneE164 ? { phone_e164: phoneE164 } : {}),
    };
  }
  return {
    payment_method: String(newValue.paymentMethod ?? ""),
    bank_name: String(newValue.bankName ?? ""),
    account_number: String(newValue.accountNumber ?? ""),
    bank_branch: String(newValue.bankBranch ?? ""),
    momo_number: String(newValue.momoNumber ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapChangeRequestRow(row: any): ChangeRequestRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    requestedBy: row.requested_by ?? null,
    fieldType: row.field_type,
    oldValue: (row.old_value ?? {}) as Record<string, unknown>,
    newValue: (row.new_value ?? {}) as Record<string, unknown>,
    status: row.status,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    rejectionReason: row.rejection_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
