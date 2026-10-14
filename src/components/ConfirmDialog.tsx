"use client";

import { AlertTriangle, Loader, X } from "lucide-react";

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "color-mix(in oklch, var(--foreground) 45%, transparent)" }}
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={busy ? undefined : onCancel}
        className="absolute inset-0"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        className="relative w-full max-w-md rounded-2xl p-6"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close"
          className="absolute top-4 right-4"
          style={{
            background: "none",
            border: "none",
            cursor: busy ? "not-allowed" : "pointer",
            color: "var(--muted-foreground)",
          }}
        >
          <X size={16} />
        </button>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
          style={{
            background: "color-mix(in oklch, var(--destructive) 15%, transparent)",
            border: "1px solid color-mix(in oklch, var(--destructive) 35%, transparent)",
          }}
        >
          <AlertTriangle size={18} color="var(--destructive)" />
        </div>
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--foreground)", margin: "0 0 8px" }}
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-body"
          className="text-sm leading-relaxed mb-6"
          style={{ color: "var(--muted-foreground)", margin: "0 0 24px" }}
        >
          {body}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--foreground)",
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid color-mix(in oklch, var(--destructive) 40%, transparent)",
              background: "color-mix(in oklch, var(--destructive) 18%, transparent)",
              color: "var(--destructive)",
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {busy ? <Loader size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
