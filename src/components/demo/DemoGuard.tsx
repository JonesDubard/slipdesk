"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Lock, X } from "lucide-react";
import {
  DEMO_FEATURE_COPY,
  bookDemoUrl,
  type DemoFeatureName,
} from "@/lib/demo/constants";
import { useApp } from "@/context/AppContext";

interface DemoGuardState {
  isDemo: boolean;
  /** Returns false (and opens UpgradePrompt) when blocked; true when allowed. */
  guardAction: (feature: DemoFeatureName) => boolean;
  requestUpgrade: (feature: DemoFeatureName) => void;
}

const DemoGuardContext = createContext<DemoGuardState | null>(null);

export function DemoGuardProvider({ children }: { children: ReactNode }) {
  const { company } = useApp();
  const isDemo = Boolean(company.isDemo);
  const [feature, setFeature] = useState<DemoFeatureName | null>(null);

  const requestUpgrade = useCallback((name: DemoFeatureName) => {
    setFeature(name);
  }, []);

  useEffect(() => {
    function onReadonly(ev: Event) {
      const detail = (ev as CustomEvent<{ feature?: DemoFeatureName }>).detail;
      setFeature(detail?.feature ?? "generic");
    }
    window.addEventListener("slipdesk:demo-readonly", onReadonly);
    return () => window.removeEventListener("slipdesk:demo-readonly", onReadonly);
  }, []);

  const guardAction = useCallback(
    (name: DemoFeatureName) => {
      if (!isDemo) return true;
      setFeature(name);
      return false;
    },
    [isDemo],
  );

  const value = useMemo(
    () => ({ isDemo, guardAction, requestUpgrade }),
    [isDemo, guardAction, requestUpgrade],
  );

  return (
    <DemoGuardContext.Provider value={value}>
      <div className="flex flex-col h-screen bg-slate-50">
        {isDemo && <DemoBanner />}
        <div className="flex flex-1 min-h-0">{children}</div>
      </div>
      {isDemo && <DemoEngagementNudge />}
      <UpgradePrompt
        featureName={feature ?? "generic"}
        open={feature !== null}
        onClose={() => setFeature(null)}
      />
    </DemoGuardContext.Provider>
  );
}

export function useDemoGuard(): DemoGuardState {
  const ctx = useContext(DemoGuardContext);
  if (!ctx) {
    return {
      isDemo: false,
      guardAction: () => true,
      requestUpgrade: () => undefined,
    };
  }
  return ctx;
}

export function UpgradePrompt({
  featureName,
  open,
  onClose,
}: {
  featureName: DemoFeatureName;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  const copy = DEMO_FEATURE_COPY[featureName] ?? DEMO_FEATURE_COPY.generic;
  const bookHref = bookDemoUrl();
  const primaryIsBook = copy.primaryCta === "book";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-prompt-title"
        className="relative w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-100 p-6"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
          <Lock className="w-5 h-5 text-amber-600" />
        </div>
        <h2 id="upgrade-prompt-title" className="text-lg font-semibold text-slate-900 mb-2">
          {copy.title}
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">{copy.body}</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={primaryIsBook ? bookHref : "/#pricing"}
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-[#50C878] text-[#002147] text-sm font-bold hover:bg-[#3aa85f] transition-colors"
            onClick={onClose}
          >
            {primaryIsBook ? "Book a Live Demo" : "View Pricing"}
          </a>
          <a
            href={primaryIsBook ? "/#pricing" : bookHref}
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
            onClick={onClose}
          >
            {primaryIsBook ? "View Pricing" : "Book a Live Demo"}
          </a>
        </div>
      </div>
    </div>
  );
}

function DemoBanner() {
  const bookHref = bookDemoUrl();
  return (
    <div className="flex-shrink-0 bg-[#002147] text-white text-sm px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-white/10">
      <span className="font-medium">
        You&apos;re exploring a read-only demo of ABC Construction Ltd.
      </span>
      <span className="text-white/40 hidden sm:inline">·</span>
      <span className="text-white/70">Love what you see? Start your paid plan today.</span>
      <a href={bookHref} className="font-semibold text-[#50C878] hover:underline">
        Book a Live Demo
      </a>
      <Link href="/#pricing" className="font-semibold text-white/80 hover:text-white underline-offset-2 hover:underline">
        View Pricing
      </Link>
    </div>
  );
}

function DemoEngagementNudge() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "slipdesk_demo_nudge_shown";
    if (sessionStorage.getItem(key)) return;

    let views = Number(sessionStorage.getItem("slipdesk_demo_views") || "0");
    views += 1;
    sessionStorage.setItem("slipdesk_demo_views", String(views));

    const maybeShow = () => {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      setOpen(true);
    };

    if (views >= 10) maybeShow();

    const timer = window.setTimeout(maybeShow, 5 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!open) return null;

  return (
    <UpgradePrompt
      featureName="generic"
      open={open}
      onClose={() => setOpen(false)}
    />
  );
}
