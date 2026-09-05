"use client";

import { Landmark } from "lucide-react";
import type { FinalizedPayrollLine } from "@/lib/compliance/statutory-exports";
import {
  LRA_MAPPED_HEADERS,
  LRA_OFFICIAL_FORMAT_STATUS,
  lraWorkingScheduleRows,
  mapLraWorkingSchedule,
  validateLraMapping,
} from "@/lib/compliance/lra/mapping";
import { downloadCSV, downloadExcel } from "@/lib/reporting";
import { btnGhost } from "@/components/module-ui";

interface Props {
  companyName: string;
  employerTin: string;
  periodLabel: string;
  lines: FinalizedPayrollLine[] | null;
  selected: boolean;
  canExport: boolean;
  busy: boolean;
  onBusy: (id: string | null) => void;
}

export default function LraStatutoryCard({
  companyName,
  employerTin,
  periodLabel,
  lines,
  selected,
  canExport,
  busy,
  onBusy,
}: Props) {
  const mapped = mapLraWorkingSchedule({
    employerName: companyName,
    employerTin,
    periodLabel,
    lines: lines ?? [],
  });
  const check = validateLraMapping({ employerTin, lines: lines ?? [] });

  function downloadWorking(kind: "csv" | "excel") {
    onBusy(`lra-${kind}`);
    try {
      const rows = lraWorkingScheduleRows(mapped);
      const fname = `LRA_PAYE_Working_Schedule_${periodLabel.replace(/\s+/g, "_")}`;
      if (kind === "csv") downloadCSV(fname, [...LRA_MAPPED_HEADERS], rows);
      else downloadExcel(fname, [{ name: "PAYE Working", headers: [...LRA_MAPPED_HEADERS], rows }]);
    } finally {
      onBusy(null);
    }
  }

  return (
    <div
      data-testid="lra-statutory"
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
          <Landmark size={16} />
        </div>
        <div>
          <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 14, margin: 0 }}>LRA / PAYE Working Report</p>
          <p style={{ color: "var(--muted-foreground)", fontSize: 11, margin: "2px 0 0" }}>
            Internal PAYE working schedule from finalized payroll. Not an official LRA e-Tax upload file ({LRA_OFFICIAL_FORMAT_STATUS}).
          </p>
        </div>
      </div>

      {!canExport ? (
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>View only — your role cannot export.</span>
      ) : !selected ? (
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Select a finalized payroll period above.</span>
      ) : (
        <>
          {check.errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--destructive)" }}>
              {check.errors.map((e) => <li key={e.code}>{e.message}</li>)}
            </ul>
          )}
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--muted-foreground)" }}>
            {check.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
          </ul>
          {mapped.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--foreground)" }}>
              Mapped {mapped.length} employee{mapped.length !== 1 ? "s" : ""} · PAYE withheld from finalized income tax.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy || !lines?.length}
              onClick={() => downloadWorking("excel")}
              style={btnGhost()}
            >
              Working schedule (Excel)
            </button>
            <button
              type="button"
              disabled={busy || !lines?.length}
              onClick={() => downloadWorking("csv")}
              style={btnGhost()}
            >
              Working schedule (CSV)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
