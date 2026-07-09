"use client";

/**
 * Slipdesk — Shared building blocks for the new module pages
 * (Analytics, Compliance, Reporting). Matches the existing dashboard visual
 * language (CSS variable design tokens, DM Sans / DM Mono).
 */

import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

export const FONT_IMPORT = (
  <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');`}</style>
);

export function ModuleShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: "32px", minHeight: "100vh", background: "var(--background)", fontFamily: "'DM Sans',sans-serif" }}>
      {FONT_IMPORT}
      {children}
    </div>
  );
}

export function ModuleHeader({
  title, subtitle, actions,
}: {
  title: string; subtitle?: string; actions?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
      <div>
        <h1 style={{ color: "var(--foreground)", fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{title}</h1>
        {subtitle && (
          <p style={{ color: "var(--muted-foreground)", fontSize: 13, marginTop: 5, fontFamily: "'DM Mono',monospace" }}>{subtitle}</p>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 22, ...style }}>
      {children}
    </div>
  );
}

export function StatTile({
  label, value, sub, accent, warning,
}: {
  label: string; value: string | number; sub?: string; accent?: boolean; warning?: boolean;
}) {
  const color = accent ? "var(--primary)" : warning ? "var(--warning)" : "var(--foreground)";
  return (
    <div style={{
      background: accent ? "color-mix(in oklch, var(--primary) 12%, var(--card))" : "var(--card)",
      border: `1px solid ${accent ? "color-mix(in oklch, var(--primary) 40%, transparent)" : "var(--border)"}`,
      borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 8,
    }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'DM Mono',monospace" }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1, color }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace" }}>{sub}</p>}
    </div>
  );
}

export function btnPrimary(): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 11,
    background: "var(--primary)", color: "var(--primary-foreground)", fontWeight: 700, fontSize: 13,
    textDecoration: "none", border: "none", cursor: "pointer",
  };
}

export function btnGhost(): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 11,
    background: "var(--card)", color: "var(--foreground)", fontWeight: 600, fontSize: 13,
    textDecoration: "none", border: "1px solid var(--border)", cursor: "pointer",
  };
}

/** Full-page notice shown when the current plan does not include a module. */
export function UpgradeNotice({ title, requiredPlan, description }: { title: string; requiredPlan: string; description: string }) {
  return (
    <ModuleShell>
      <ModuleHeader title={title} />
      <Card style={{ maxWidth: 560, textAlign: "center", padding: "48px 32px" }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16, margin: "0 auto 18px",
          background: "color-mix(in oklch, var(--primary) 15%, transparent)",
          border: "1px solid color-mix(in oklch, var(--primary) 35%, transparent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Lock size={26} color="var(--primary)" />
        </div>
        <h2 style={{ color: "var(--foreground)", fontSize: 19, fontWeight: 800, margin: "0 0 8px" }}>
          Available on the {requiredPlan} plan
        </h2>
        <p style={{ color: "var(--muted-foreground)", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>{description}</p>
        <Link href="/billing" style={btnPrimary()}>
          Upgrade to {requiredPlan} <ArrowRight size={15} />
        </Link>
      </Card>
    </ModuleShell>
  );
}
