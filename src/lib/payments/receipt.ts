export function buildPaymentReceiptUpdate(
  receiptNote: string | null | undefined,
  receiptUrl: string | null | undefined,
): Record<string, string | null> {
  const payload: Record<string, string | null> = {
    receipt_note: receiptNote?.trim() || null,
  };
  if (receiptUrl?.trim()) {
    payload.receipt_url = receiptUrl.trim();
  }
  return payload;
}
