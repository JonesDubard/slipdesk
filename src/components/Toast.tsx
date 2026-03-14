"use client";

/**
 * Slipdesk — Toast Notification System
 * Place at: src/components/Toast.tsx
 *
 * Self-contained — no extra dependencies.
 *
 * Usage:
 *   1. Wrap your app (or dashboard layout) with <ToastProvider>
 *   2. Call const { toast } = useToast() anywhere inside it
 *   3. toast.success("Saved!") | toast.error("Something went wrong") | toast.info("...")
 */

import {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id:       string;
  message:  string;
  variant:  ToastVariant;
  duration: number;         // ms
}

interface ToastAPI {
  success: (message: string, duration?: number) => void;
  error:   (message: string, duration?: number) => void;
  info:    (message: string, duration?: number) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastAPI | null>(null);

// ─── Individual toast ─────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "bg-white border-emerald-200 text-emerald-800",
  error:   "bg-white border-red-200   text-red-800",
  info:    "bg-white border-blue-200  text-blue-800",
};

const ICON_STYLES: Record<ToastVariant, string> = {
  success: "text-emerald-500",
  error:   "text-red-400",
  info:    "text-blue-400",
};

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const cls = `w-4 h-4 flex-shrink-0 mt-0.5 ${ICON_STYLES[variant]}`;
  if (variant === "success") return <CheckCircle2 className={cls}/>;
  if (variant === "error")   return <AlertCircle  className={cls}/>;
  return <Info className={cls}/>;
}

function ToastCard({
  item, onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(item.id), 300); // wait for fade-out
    }, item.duration);
    return () => clearTimeout(t);
  }, [item.id, item.duration, onDismiss]);

  function dismiss() {
    setVisible(false);
    setTimeout(() => onDismiss(item.id), 300);
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{ transition: "opacity 300ms, transform 300ms" }}
      className={`
        flex items-start gap-3 w-80 px-4 py-3
        rounded-xl border shadow-lg shadow-slate-200/60
        ${VARIANT_STYLES[item.variant]}
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}>
      <ToastIcon variant={item.variant}/>
      <p className="text-sm flex-1 leading-snug">{item.message}</p>
      <button
        onClick={dismiss}
        aria-label="Dismiss notification"
        className="text-slate-300 hover:text-slate-500 transition-colors mt-0.5 flex-shrink-0">
        <X className="w-3.5 h-3.5"/>
      </button>
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter             = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((
    message: string,
    variant: ToastVariant,
    duration = variant === "error" ? 6000 : 4000,
  ) => {
    const id = `toast-${++counter.current}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, variant, duration }]);
  }, []);

  const api: ToastAPI = {
    success: (m, d) => push(m, "success", d),
    error:   (m, d) => push(m, "error",   d),
    info:    (m, d) => push(m, "info",    d),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Toast viewport — fixed bottom-right */}
      <div
        aria-label="Notifications"
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastCard item={t} onDismiss={dismiss}/>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): { toast: ToastAPI } {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return { toast: ctx };
}