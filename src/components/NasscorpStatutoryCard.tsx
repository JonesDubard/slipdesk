"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, ShieldCheck } from "lucide-react";
import type { FinalizedPayrollLine } from "@/lib/compliance/statutory-exports";
import { buildNasscorpFilingInput } from "@/lib/compliance/nasscorp/map";
import { downloadNasscorpWorkbook } from "@/lib/compliance/nasscorp/format";
import { validateNasscorpFiling } from "@/lib/compliance/nasscorp/validate";
import {
  DEFAULT_NASSCORP_PAYROLL_TYPE,
  NASSCORP_PAYROLL_TYPE_LABELS,
  isNasscorpPayrollType,
  type NasscorpPayrollType,
} from "@/lib/compliance/nasscorp/spec";
import {
  readStoredNasscorpPayrollType,
  storeNasscorpPayrollType,
} from "@/lib/compliance/nasscorp/payroll-type";
import { btnGhost } from "@/components/module-ui";

interface Props {
  companyId: string;
  companyName: string;
  employerId: string;
  lines: FinalizedPayrollLine[] | null;
  periodLabel: string;
  selected: boolean;
  canExport: boolean;
}

export default function NasscorpStatutoryCard({
  companyId,
  companyName,
  employerId,
  lines,
  periodLabel,
  selected,
  canExport,
}: Props) {
  const [payrollType, setPayrollType] = useState<NasscorpPayrollType>(DEFAULT_NASSCORP_PAYROLL_TYPE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPayrollType(readStoredNasscorpPayrollType(companyId));
  }, [companyId]);

  const payrollDate = useMemo(() => {
    const fromLine = lines?.find((l) => l.payDate)?.payDate ?? "";
    return fromLine.slice(0, 10);
  }, [lines]);

  const filing = useMemo(
    () => buildNasscorpFilingInput({
      employerId,
      employerName: companyName,
      payrollDate,
      payrollType,
      lines: lines ?? [],
    }),
    [employerId, companyName, payrollDate, payrollType, lines],
  );

  const result = useMemo(
    () => (selected ? validateNasscorpFiling(filing) : null),
    [selected, filing],
  );

  function generate() {
    if (!result?.ok) return;
    setBusy(true);
    try {
      storeNasscorpPayrollType(companyId, payrollType);
      downloadNasscorpWorkbook(filing, `NASSCORP_Payroll_${periodLabel.replace(/\s+/g, "_")}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="nasscorp-statutory"
      style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: "color-mix(in oklch, var(--primary) 15%, transparent)",
          border: "1px solid color-mix(in oklch, var(--primary) 35%, transparent)",
          display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)",
        }}>
          <ShieldCheck size={16} />
        </div>
        <div>
          <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 14, margin: 0 }}>
            NASSCORP Statutory Export
          </p>
          <p style={{ color: "var(--muted-foreground)", fontSize: 11, margin: "2px 0 0" }}>
            Official 2025 two-sheet Excel for email submission — not a remittance receipt or certified e-filing.
          </p>
        </div>
      </div>

      {!canExport ? (
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>View only — your role cannot export.</span>
      ) : !selected ? (
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Select a finalized payroll period above.</span>
      ) : (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--muted-foreground)" }}>
            PayrollType
            <select
              aria-label="NASSCORP PayrollType"
              value={payrollType}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (isNasscorpPayrollType(n)) {
                  setPayrollType(n);
                  storeNasscorpPayrollType(companyId, n);
                }
              }}
              style={{
                maxWidth: 260, padding: "8px 10px", borderRadius: 9,
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: 13,
              }}
            >
              <option value={1}>{NASSCORP_PAYROLL_TYPE_LABELS[1]} (1)</option>
              <option value={2}>{NASSCORP_PAYROLL_TYPE_LABELS[2]} (2)</option>
            </select>
          </label>

          {result && result.errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--destructive)" }}>
              {result.errors.map((e) => <li key={e.code + e.message}>{e.message}</li>)}
            </ul>
          )}
          {result && result.ok && result.warnings.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--muted-foreground)" }}>
              {result.warnings.map((w) => <li key={w.code + w.message}>{w.message}</li>)}
            </ul>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              disabled={busy || !result?.ok}
              onClick={generate}
              style={btnGhost()}
            >
              <FileSpreadsheet size={14} /> {busy ? "Generating…" : "Download XLSX"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
