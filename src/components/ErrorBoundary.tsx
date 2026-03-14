"use client";

/**
 * Slipdesk — Error Boundary
 * Place at: src/components/ErrorBoundary.tsx
 *
 * Wraps any subtree and catches render-time JS errors,
 * displaying a friendly fallback instead of a blank page.
 *
 * Usage:
 *   <ErrorBoundary label="Payroll">
 *     <PayrollPage />
 *   </ErrorBoundary>
 *
 * Note: Error boundaries must be class components in React.
 * The `label` prop is used in the error heading and for reporting.
 */

import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children:  ReactNode;
  label?:    string;        // e.g. "Payroll", "Employees" — shown in fallback UI
  fallback?: ReactNode;     // optional fully-custom fallback
}

interface State {
  hasError:  boolean;
  message:   string;
  stack:     string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "", stack: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "An unexpected error occurred.";

    const stack = error instanceof Error ? (error.stack ?? "") : "";

    return { hasError: true, message, stack };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Non-blocking — log to console for now.
    // When a proper error-reporting service (Sentry, etc.) is added,
    // call it here: captureException(error, { extra: info })
    console.error(`[ErrorBoundary:${this.props.label ?? "App"}]`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "", stack: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Custom fallback takes full control
    if (this.props.fallback) return this.props.fallback;

    const label = this.props.label ?? "This section";

    return (
      <div className="flex items-start justify-center pt-20 px-4 min-h-[60vh]">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-100 p-8 text-center shadow-sm">

          {/* Icon */}
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-7 h-7 text-red-400"/>
          </div>

          {/* Heading */}
          <h2 className="text-lg font-bold text-slate-800">
            {label} ran into a problem
          </h2>
          <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
            Something went wrong while rendering this page.
            Your data is safe — this is a display error only.
          </p>

          {/* Error detail — collapsed by default */}
          {this.state.message && (
            <details className="mt-4 text-left">
              <summary className="text-xs text-slate-400 cursor-pointer select-none hover:text-slate-600 transition-colors">
                Error details
              </summary>
              <pre className="mt-2 text-[11px] text-red-600 bg-red-50 rounded-xl p-3 overflow-auto max-h-40 leading-relaxed whitespace-pre-wrap">
                {this.state.message}
                {this.state.stack ? `\n\n${this.state.stack}` : ""}
              </pre>
            </details>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={this.handleReset}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         text-sm font-semibold bg-[#002147] text-white
                         hover:bg-[#002147]/80 transition-colors">
              <RefreshCw className="w-3.5 h-3.5"/>
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold
                         border border-slate-200 text-slate-600
                         hover:bg-slate-50 transition-colors">
              Reload page
            </button>
          </div>

        </div>
      </div>
    );
  }
}
