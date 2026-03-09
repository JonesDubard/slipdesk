"use client";

import { useReducer, useMemo, useRef, useState, useCallback } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
  ChevronRight,
  FileText,
  Lock,
  Play,
  RotateCcw,
  Clock,
} from "lucide-react";
import {
  calculatePayroll,
  type PayrollResult,
} from "@/lib/slipdesk-payroll-engine";
import { MOCK_PAY_RUN_LINES, MOCK_PAY_RUNS, type PayRunLine } from "@/lib/mock-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type RunStatus = "draft" | "review" | "approved" | "paid";

// ─── Grid Reducer ─────────────────────────────────────────────────────────────

type GridAction =
  | { type: "UPDATE_FIELD"; id: string; field: keyof PayRunLine; value: number }
  | { type: "RESET" };

function recalcLine(line: PayRunLine): PayRunLine {
  try {
    const calc = calculatePayroll({
      employeeId:         line.employeeId,
      currency:           line.currency,
      rate:               line.rate,
      regularHours:       line.regularHours,
      overtimeHours:      line.overtimeHours,
      holidayHours:       line.holidayHours,
      exchangeRate:       line.exchangeRate,
      additionalEarnings: line.additionalEarnings,
    });
    return { ...line, calc };
  } catch {
    return { ...line, calc: null };
  }
}

function gridReducer(state: PayRunLine[], action: GridAction): PayRunLine[] {
  switch (action.type) {
    case "UPDATE_FIELD":
      return state.map((line) => {
        if (line.id !== action.id) return line;
        const updated = { ...line, [action.field]: action.value };
        return recalcLine(updated);
      });
    case "RESET":
      return MOCK_PAY_RUN_LINES.map(recalcLine);
    default:
      return state;
  }
}

// ─── Editable Cell ────────────────────────────────────────────────────────────

function EditableCell({
  value,
  lineId,
  field,
  isLocked,
  dispatch,
  prefix = "",
  decimals = 2,
}: {
  value: number;
  lineId: string;
  field: keyof PayRunLine;
  isLocked: boolean;
  dispatch: React.Dispatch<GridAction>;
  prefix?: string;
  decimals?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const num = parseFloat(local);
    if (!isNaN(num) && num >= 0) {
      dispatch({ type: "UPDATE_FIELD", id: lineId, field, value: num });
    } else {
      setLocal(String(value));
    }
    setEditing(false);
  }, [local, lineId, field, value, dispatch]);

  if (isLocked) {
    return (
      <span className="block text-right font-mono text-xs text-slate-400">
        {prefix}{value.toFixed(decimals)}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        className="w-full text-right font-mono text-xs bg-emerald-50 border border-emerald-400
                   rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setLocal(String(value)); setEditing(false); }
        }}
      />
    );
  }

  return (
    <button
      onClick={() => { setLocal(String(value)); setEditing(true); }}
      className="w-full text-right font-mono text-xs text-slate-600 hover:bg-emerald-50
                 hover:text-emerald-700 rounded px-1.5 py-0.5 transition-colors cursor-text"
    >
      {prefix}{value.toFixed(decimals)}
    </button>
  );
}

// ─── Summary Footer ───────────────────────────────────────────────────────────

function RunSummary({ lines }: { lines: PayRunLine[] }) {
  const FX = 193.5;
  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        if (!line.calc) return acc;
        const toUSD = (n: number) => (line.currency === "USD" ? n : n / FX);
        return {
          gross:    acc.gross    + toUSD(line.calc.grossPay),
          nasscorp: acc.nasscorp + toUSD(line.calc.nasscorp.employeeContribution),
          erNasc:   acc.erNasc   + toUSD(line.calc.nasscorp.employerContribution),
          paye:     acc.paye     + toUSD(line.calc.paye.taxInBase),
          net:      acc.net      + toUSD(line.calc.netPay),
          cost:     acc.cost     + toUSD(line.calc.totalEmployerCost),
        };
      },
      { gross: 0, nasscorp: 0, erNasc: 0, paye: 0, net: 0, cost: 0 }
    );
  }, [lines]);

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const items = [
    { label: "Gross Pay",       value: fmt(totals.gross),    color: "text-white" },
    { label: "NASSCORP (EE)",   value: fmt(totals.nasscorp), color: "text-orange-300" },
    { label: "NASSCORP (ER)",   value: fmt(totals.erNasc),   color: "text-orange-400" },
    { label: "PAYE to LRA",     value: fmt(totals.paye),     color: "text-red-300" },
    { label: "Net Pay",         value: fmt(totals.net),      color: "text-[#50C878]" },
    { label: "Total Employer Cost", value: fmt(totals.cost), color: "text-blue-300" },
  ];

  return (
    <div className="bg-[#002147] rounded-b-2xl px-4 py-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
        <span className="text-white/30 text-[10px] font-mono uppercase tracking-widest mr-auto hidden sm:block">
          USD Totals
        </span>
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-[9px] font-mono text-white/30 uppercase">{item.label}</p>
            <p className={`font-mono font-bold text-sm ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status Steps ─────────────────────────────────────────────────────────────

const STATUS_STEPS: RunStatus[] = ["draft", "review", "approved", "paid"];
const STATUS_LABELS: Record<RunStatus, string> = {
  draft:    "Draft",
  review:   "In Review",
  approved: "Approved",
  paid:     "Paid",
};

function StatusStepper({
  current,
  onAdvance,
}: {
  current: RunStatus;
  onAdvance: () => void;
}) {
  const currentIdx = STATUS_STEPS.indexOf(current);
  const canAdvance = current !== "paid";

  const nextLabel: Record<RunStatus, string> = {
    draft:    "Submit for Review",
    review:   "Approve Pay Run",
    approved: "Mark as Paid",
    paid:     "Completed",
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1">
        {STATUS_STEPS.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={step} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono ${
                active
                  ? "bg-[#50C878] text-[#002147] font-bold"
                  : done
                  ? "bg-emerald-100 text-emerald-600"
                  : "bg-slate-100 text-slate-400"
              }`}>
                {done && <CheckCircle2 className="w-3 h-3" />}
                {STATUS_LABELS[step]}
              </div>
              {i < STATUS_STEPS.length - 1 && (
                <ChevronRight className="w-3 h-3 text-slate-300" />
              )}
            </div>
          );
        })}
      </div>
      {canAdvance && (
        <button
          onClick={onAdvance}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold
                     bg-[#002147] text-white hover:bg-[#002147]/80 transition-colors"
        >
          <Play className="w-3 h-3" />
          {nextLabel[current]}
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const [lines, dispatch] = useReducer(
    gridReducer,
    MOCK_PAY_RUN_LINES,
    (init) => init.map(recalcLine)
  );
  const [status, setStatus] = useState<RunStatus>("draft");
  const isLocked = status === "approved" || status === "paid";

  const warningCount = lines.filter((l) => l.calc && l.calc.warnings.length > 0).length;

  function advanceStatus() {
    const idx = STATUS_STEPS.indexOf(status);
    if (idx < STATUS_STEPS.length - 1) {
      setStatus(STATUS_STEPS[idx + 1]);
    }
  }

  // ── Columns ──
  const col = createColumnHelper<PayRunLine>();

  const columns = useMemo(() => [
    col.accessor("employeeNumber", {
      header: "Emp #",
      size: 72,
      cell: (c) => <span className="font-mono text-[10px] text-slate-400">{c.getValue()}</span>,
    }),
    col.accessor("fullName", {
      header: "Name",
      size: 140,
      cell: (c) => (
        <div>
          <p className="text-xs font-medium text-slate-700 leading-tight">{c.getValue()}</p>
          <p className="text-[10px] text-slate-400">{c.row.original.department}</p>
        </div>
      ),
    }),
    col.accessor("currency", {
      header: "CCY",
      size: 52,
      cell: (c) => (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          c.getValue() === "USD" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
        }`}>
          {c.getValue()}
        </span>
      ),
    }),
    col.accessor("rate", {
      header: "Rate",
      size: 80,
      cell: (c) => (
        <EditableCell
          value={c.getValue()}
          lineId={c.row.original.id}
          field="rate"
          dispatch={dispatch}
          isLocked={isLocked}
          prefix={c.row.original.currency === "USD" ? "$" : "L$"}
        />
      ),
    }),
    col.accessor("regularHours", {
      header: "Reg Hrs",
      size: 72,
      cell: (c) => (
        <EditableCell
          value={c.getValue()}
          lineId={c.row.original.id}
          field="regularHours"
          dispatch={dispatch}
          isLocked={isLocked}
        />
      ),
    }),
    col.accessor("overtimeHours", {
      header: "OT Hrs",
      size: 68,
      cell: (c) => (
        <EditableCell
          value={c.getValue()}
          lineId={c.row.original.id}
          field="overtimeHours"
          dispatch={dispatch}
          isLocked={isLocked}
        />
      ),
    }),
    col.accessor("holidayHours", {
      header: "Hol Hrs",
      size: 68,
      cell: (c) => (
        <EditableCell
          value={c.getValue()}
          lineId={c.row.original.id}
          field="holidayHours"
          dispatch={dispatch}
          isLocked={isLocked}
        />
      ),
    }),
    col.accessor("additionalEarnings", {
      header: "Extras",
      size: 72,
      cell: (c) => (
        <EditableCell
          value={c.getValue()}
          lineId={c.row.original.id}
          field="additionalEarnings"
          dispatch={dispatch}
          isLocked={isLocked}
          prefix={c.row.original.currency === "USD" ? "$" : "L$"}
        />
      ),
    }),
    col.display({
      id: "grossPay",
      header: "Gross",
      size: 88,
      cell: (c) => {
        const sym = c.row.original.currency === "USD" ? "$" : "L$";
        return (
          <span className="block text-right font-mono text-xs font-semibold text-slate-700">
            {c.row.original.calc ? `${sym}${c.row.original.calc.grossPay.toFixed(2)}` : "—"}
          </span>
        );
      },
    }),
    col.display({
      id: "nasscorp",
      header: "NASSCORP",
      size: 88,
      cell: (c) => {
        const sym = c.row.original.currency === "USD" ? "$" : "L$";
        return (
          <span className="block text-right font-mono text-xs text-orange-500">
            {c.row.original.calc
              ? `${sym}${c.row.original.calc.nasscorp.employeeContribution.toFixed(2)}`
              : "—"}
          </span>
        );
      },
    }),
    col.display({
      id: "paye",
      header: "PAYE",
      size: 88,
      cell: (c) => {
        const sym = c.row.original.currency === "USD" ? "$" : "L$";
        const calc = c.row.original.calc;
        return (
          <div className="text-right">
            <span className="font-mono text-xs text-red-500">
              {calc ? `${sym}${calc.paye.taxInBase.toFixed(2)}` : "—"}
            </span>
            {calc && calc.paye.effectiveRate > 0 && (
              <p className="text-[9px] text-slate-400 font-mono">
                {(calc.paye.effectiveRate * 100).toFixed(1)}%
              </p>
            )}
          </div>
        );
      },
    }),
    col.display({
      id: "netPay",
      header: "Net Pay",
      size: 96,
      cell: (c) => {
        const sym = c.row.original.currency === "USD" ? "$" : "L$";
        return (
          <span className="block text-right font-mono text-xs font-bold text-emerald-600">
            {c.row.original.calc
              ? `${sym}${c.row.original.calc.netPay.toFixed(2)}`
              : "—"}
          </span>
        );
      },
    }),
    col.display({
      id: "warn",
      header: "",
      size: 32,
      cell: (c) => {
        const warnings = c.row.original.calc?.warnings ?? [];
        if (warnings.length === 0) {
          return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" />;
        }
        return (
          <div className="relative group mx-auto w-fit">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 cursor-pointer" />
            <div className="absolute right-0 top-5 z-50 hidden group-hover:block w-64
                            bg-white shadow-xl border border-amber-100 rounded-xl p-3
                            text-xs text-amber-700 leading-relaxed">
              {warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          </div>
        );
      },
    }),
  ], [isLocked]);

  const table = useReactTable({
    data: lines,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Payroll</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            June 2025 · {lines.length} employees
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isLocked && (
            <button
              onClick={() => dispatch({ type: "RESET" })}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500
                         border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500
                             border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold
                             text-[#002147] bg-[#50C878] hover:bg-[#3aa85f] rounded-xl transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Status stepper */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
        <StatusStepper current={status} onAdvance={advanceStatus} />
      </div>

      {/* Warnings banner */}
      {warningCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            <strong>{warningCount} employee{warningCount > 1 ? "s" : ""}</strong> have earnings
            below the $150 USD minimum wage threshold. Review before approving.
          </p>
        </div>
      )}

      {/* Locked banner */}
      {isLocked && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5">
          <Lock className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700">
            This pay run is <strong>{status}</strong>. All figures are locked.
          </p>
        </div>
      )}

      {/* Grid */}
      <div className="bg-white rounded-t-2xl border border-slate-200 overflow-hidden">
        {/* Grid header bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#002147] text-white">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-white/50" />
            <span className="text-sm font-semibold">Review & Edit</span>
            {!isLocked && (
              <span className="text-[10px] font-mono text-white/40">
                Click any cell to edit
              </span>
            )}
          </div>
          {warningCount > 0 && (
            <span className="text-[10px] font-mono text-amber-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {warningCount} warning{warningCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="bg-slate-50 border-b border-slate-200">
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      style={{ width: h.getSize() }}
                      className="px-3 py-2.5 text-[10px] font-mono font-semibold text-slate-400
                                 uppercase tracking-wider whitespace-nowrap"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-b border-slate-100 transition-colors
                    ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                    hover:bg-emerald-50/30
                    ${row.original.calc?.warnings.length
                      ? "border-l-2 border-l-amber-400"
                      : "border-l-2 border-l-transparent"
                    }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2.5"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <RunSummary lines={lines} />

      {/* Pay run history */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          Pay Run History
        </h2>
        <div className="space-y-2">
          {MOCK_PAY_RUNS.map((run) => (
            <div
              key={run.id}
              className="flex items-center justify-between py-3 px-4 rounded-xl
                         hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-700">{run.periodLabel}</p>
                  <p className="text-xs text-slate-400 font-mono">
                    {run.employeeCount} employees · ${run.totalGross.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded-full ${
                  run.status === "paid"    ? "bg-emerald-100 text-emerald-700" :
                  run.status === "draft"   ? "bg-slate-100 text-slate-500" :
                  run.status === "review"  ? "bg-amber-100 text-amber-700" :
                                            "bg-blue-100 text-blue-700"
                }`}>
                  {run.status}
                </span>
                {run.status === "paid" && (
                  <button className="text-xs text-[#50C878] hover:underline flex items-center gap-1">
                    <Download className="w-3 h-3" /> PDF
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}