"use client";

/**
 * Slipdesk — PayrollGrid
 * Editable TanStack Table with instant recalculation on Rate / Hours changes.
 *
 * Deps (add to package.json):
 *   @tanstack/react-table  ^8
 *   lucide-react
 *   (tailwind + shadcn/ui already set up in the Next.js project)
 */

import React, { useCallback, useMemo, useReducer, useRef } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Row,
} from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, Download, Upload } from "lucide-react";

// ── Import the engine (path relative to this file) ──────────────────────────
import {
  calculatePayroll,
  type Currency,
  type PayrollResult,
} from "@/lib/slipdesk-payroll-engine";

// ─── Row model ───────────────────────────────────────────────────────────────

export interface GridRow {
  // Identity
  id: string;
  employeeNumber: string;
  fullName: string;

  // Editable inputs
  currency: Currency;
  rate: number;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  additionalEarnings: number;
  exchangeRate: number;

  // Calculated (read-only, derived)
  calc: PayrollResult | null;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type GridAction =
  | { type: "UPDATE_FIELD"; id: string; field: keyof GridRow; value: number | Currency }
  | { type: "SET_ROWS"; rows: GridRow[] }
  | { type: "RECALCULATE_ALL" };

function recalcRow(row: GridRow): GridRow {
  try {
    const calc = calculatePayroll({
      employeeId:         row.id,
      currency:           row.currency,
      rate:               row.rate,
      regularHours:       row.regularHours,
      overtimeHours:      row.overtimeHours,
      holidayHours:       row.holidayHours,
      exchangeRate:       row.exchangeRate,
      additionalEarnings: row.additionalEarnings,
    });
    return { ...row, calc };
  } catch {
    return { ...row, calc: null };
  }
}

function gridReducer(state: GridRow[], action: GridAction): GridRow[] {
  switch (action.type) {
    case "UPDATE_FIELD": {
      return state.map((row) => {
        if (row.id !== action.id) return row;
        const updated = { ...row, [action.field]: action.value };
        // Instantly recalculate whenever a numeric input changes
        return recalcRow(updated);
      });
    }
    case "SET_ROWS":
      return action.rows.map(recalcRow);
    case "RECALCULATE_ALL":
      return state.map(recalcRow);
    default:
      return state;
  }
}

// ─── Editable Cell ────────────────────────────────────────────────────────────

interface EditableCellProps {
  value: number;
  rowId: string;
  field: keyof GridRow;
  isLocked?: boolean;
  dispatch: React.Dispatch<GridAction>;
  prefix?: string;
  decimals?: number;
}

function EditableCell({
  value,
  rowId,
  field,
  isLocked = false,
  dispatch,
  prefix = "",
  decimals = 2,
}: EditableCellProps) {
  const [editing, setEditing] = React.useState(false);
  const [localVal, setLocalVal] = React.useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const num = parseFloat(localVal);
    if (!isNaN(num) && num >= 0) {
      dispatch({ type: "UPDATE_FIELD", id: rowId, field, value: num });
    } else {
      setLocalVal(String(value)); // revert on bad input
    }
    setEditing(false);
  }, [localVal, rowId, field, value, dispatch]);

  if (isLocked) {
    return (
      <span className="text-right block font-mono text-sm text-slate-400">
        {prefix}{value.toFixed(decimals)}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="w-full text-right font-mono text-sm bg-emerald-50 border border-emerald-400
                   rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setLocalVal(String(value)); setEditing(false); }
        }}
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={() => { setLocalVal(String(value)); setEditing(true); }}
      className="w-full text-right font-mono text-sm text-slate-700 hover:bg-emerald-50
                 hover:text-emerald-800 rounded px-2 py-0.5 transition-colors cursor-text"
    >
      {prefix}{value.toFixed(decimals)}
    </button>
  );
}

// ─── Column definition ────────────────────────────────────────────────────────

const col = createColumnHelper<GridRow>();

function buildColumns(
  dispatch: React.Dispatch<GridAction>,
  exchangeRate: number,
  isLocked: boolean
) {
  return [
    // ── Identity ──
    col.accessor("employeeNumber", {
      header: "Emp #",
      size: 80,
      cell: (c) => (
        <span className="font-mono text-xs text-slate-500">{c.getValue()}</span>
      ),
    }),
    col.accessor("fullName", {
      header: "Name",
      size: 160,
      cell: (c) => (
        <span className="font-medium text-slate-800 text-sm">{c.getValue()}</span>
      ),
    }),
    col.accessor("currency", {
      header: "CCY",
      size: 60,
      cell: (c) => (
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
          c.getValue() === "USD"
            ? "bg-blue-100 text-blue-700"
            : "bg-amber-100 text-amber-700"
        }`}>
          {c.getValue()}
        </span>
      ),
    }),

    // ── Editable Inputs ──
    col.accessor("rate", {
      header: "Rate",
      size: 90,
      cell: (c) => (
        <EditableCell
          value={c.getValue()}
          rowId={c.row.original.id}
          field="rate"
          dispatch={dispatch}
          isLocked={isLocked}
          prefix={c.row.original.currency === "USD" ? "$" : "L$"}
          decimals={2}
        />
      ),
    }),
    col.accessor("regularHours", {
      header: "Reg Hrs",
      size: 80,
      cell: (c) => (
        <EditableCell
          value={c.getValue()}
          rowId={c.row.original.id}
          field="regularHours"
          dispatch={dispatch}
          isLocked={isLocked}
          decimals={2}
        />
      ),
    }),
    col.accessor("overtimeHours", {
      header: "OT Hrs",
      size: 80,
      cell: (c) => (
        <EditableCell
          value={c.getValue()}
          rowId={c.row.original.id}
          field="overtimeHours"
          dispatch={dispatch}
          isLocked={isLocked}
          decimals={2}
        />
      ),
    }),
    col.accessor("holidayHours", {
      header: "Hol Hrs",
      size: 80,
      cell: (c) => (
        <EditableCell
          value={c.getValue()}
          rowId={c.row.original.id}
          field="holidayHours"
          dispatch={dispatch}
          isLocked={isLocked}
          decimals={2}
        />
      ),
    }),

    // ── Calculated (read-only) ──
    col.display({
      id: "grossPay",
      header: "Gross",
      size: 100,
      cell: (c) => {
        const calc = c.row.original.calc;
        const sym = c.row.original.currency === "USD" ? "$" : "L$";
        return (
          <span className="block text-right font-mono text-sm font-semibold text-slate-700">
            {calc ? `${sym}${calc.grossPay.toFixed(2)}` : "—"}
          </span>
        );
      },
    }),
    col.display({
      id: "nasscorp",
      header: "NASSCORP (EE)",
      size: 110,
      cell: (c) => {
        const calc = c.row.original.calc;
        const sym = c.row.original.currency === "USD" ? "$" : "L$";
        return (
          <span className="block text-right font-mono text-sm text-orange-600">
            {calc ? `${sym}${calc.nasscorp.employeeContribution.toFixed(2)}` : "—"}
          </span>
        );
      },
    }),
    col.display({
      id: "Paye",
      header: "Paye",
      size: 100,
      cell: (c) => {
        const calc = c.row.original.calc;
        const sym = c.row.original.currency === "USD" ? "$" : "L$";
        return (
          <div className="text-right">
            <span className="font-mono text-sm text-red-600">
              {calc ? `${sym}${calc.Paye.taxInBase.toFixed(2)}` : "—"}
            </span>
            {calc && calc.Paye.effectiveRate > 0 && (
              <span className="block text-[10px] text-slate-400">
                ({(calc.Paye.effectiveRate * 100).toFixed(1)}%)
              </span>
            )}
          </div>
        );
      },
    }),
    col.display({
      id: "netPay",
      header: "Net Pay",
      size: 110,
      cell: (c) => {
        const calc = c.row.original.calc;
        const sym = c.row.original.currency === "USD" ? "$" : "L$";
        return (
          <span className="block text-right font-mono text-sm font-bold text-emerald-700">
            {calc ? `${sym}${calc.netPay.toFixed(2)}` : "—"}
          </span>
        );
      },
    }),

    // ── Warnings ──
    col.display({
      id: "warnings",
      header: "",
      size: 36,
      cell: (c) => {
        const calc = c.row.original.calc;
        if (!calc || calc.warnings.length === 0)
          return <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />;
        return (
          <div className="relative group mx-auto w-fit">
            <AlertTriangle className="w-4 h-4 text-amber-500 cursor-pointer" />
            <div className="absolute right-0 top-5 z-50 hidden group-hover:block
                            w-72 bg-white shadow-xl border border-amber-200 rounded-lg p-3
                            text-xs text-amber-800 leading-relaxed">
              {calc.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          </div>
        );
      },
    }),
  ];
}

// ─── Summary Footer ───────────────────────────────────────────────────────────

interface FooterSummaryProps {
  rows: GridRow[];
}

function FooterSummary({ rows }: FooterSummaryProps) {
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (!row.calc) return acc;
        // Normalise everything to USD for summary (rough)
        const fx = row.exchangeRate;
        const toUSD = (n: number) => row.currency === "USD" ? n : n / fx;
        return {
          gross:    acc.gross    + toUSD(row.calc.grossPay),
          nasscorp: acc.nasscorp + toUSD(row.calc.nasscorp.employeeContribution),
          Paye:     acc.Paye     + toUSD(row.calc.Paye.taxInBase),
          net:      acc.net      + toUSD(row.calc.netPay),
        };
      },
      { gross: 0, nasscorp: 0, Paye: 0, net: 0 }
    );
  }, [rows]);

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex items-center justify-end gap-6 px-4 py-3 bg-slate-800 text-white
                    rounded-b-xl text-sm font-mono">
      <span className="text-slate-400 text-xs uppercase tracking-widest mr-auto">
        Totals (USD equiv.)
      </span>
      <div className="text-center">
        <p className="text-[10px] text-slate-400 uppercase">Gross</p>
        <p className="font-bold">{fmt(totals.gross)}</p>
      </div>
      <div className="text-center">
        <p className="text-[10px] text-orange-300 uppercase">NASSCORP EE</p>
        <p className="text-orange-300">{fmt(totals.nasscorp)}</p>
      </div>
      <div className="text-center">
        <p className="text-[10px] text-red-300 uppercase">Paye</p>
        <p className="text-red-300">{fmt(totals.Paye)}</p>
      </div>
      <div className="text-center">
        <p className="text-[10px] text-emerald-300 uppercase">Net</p>
        <p className="text-emerald-300 font-bold">{fmt(totals.net)}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface PayrollGridProps {
  initialRows?: GridRow[];
  exchangeRate?: number;
  isLocked?: boolean;
  onExport?: (rows: GridRow[]) => void;
  onImport?: () => void;
}

export default function PayrollGrid({
  initialRows = SAMPLE_ROWS,
  exchangeRate = 185.44,
  isLocked = false,
  onExport,
  onImport,
}: PayrollGridProps) {
  const [rows, dispatch] = useReducer(
    gridReducer,
    initialRows,
    (init) => init.map(recalcRow)
  );

  const columns = useMemo(
    () => buildColumns(dispatch, exchangeRate, isLocked),
    [dispatch, exchangeRate, isLocked]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const warningCount = rows.filter((r) => r.calc && r.calc.warnings.length > 0).length;

  return (
    <div className="flex flex-col gap-0 font-sans">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3
                      bg-[#002147] rounded-t-xl text-white">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-base tracking-tight">Review & Edit Payroll</h2>
          <span className="text-xs bg-white/10 rounded-full px-2.5 py-0.5">
            {rows.length} employees
          </span>
          {warningCount > 0 && (
            <span className="text-xs bg-amber-500/20 text-amber-300 rounded-full px-2.5 py-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {warningCount} warning{warningCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {onImport && (
            <button
              onClick={onImport}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                         bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
          )}
          {onExport && (
            <button
              onClick={() => onExport(rows)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                         bg-[#50C878] hover:bg-[#3db562] text-[#002147] font-semibold
                         transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-x border-slate-200">
        <table className="w-full text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-slate-50 border-b border-slate-200">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    style={{ width: h.getSize() }}
                    className="px-3 py-2.5 text-[11px] font-semibold text-slate-500
                               uppercase tracking-wider whitespace-nowrap"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row: Row<GridRow>, i) => (
              <tr
                key={row.id}
                className={`border-b border-slate-100 transition-colors
                  ${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
                  hover:bg-emerald-50/40
                  ${row.original.calc?.warnings.length ? "border-l-2 border-l-amber-400" : "border-l-2 border-l-transparent"}
                `}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2" style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <FooterSummary rows={rows} />
    </div>
  );
}

// ─── Sample data ──────────────────────────────────────────────────────────────

const SAMPLE_ROWS: GridRow[] = [
  {
    id: "EMP-001",
    employeeNumber: "EMP-001",
    fullName: "Moses Kollie",
    currency: "USD",
    rate: 8.50,
    regularHours: 173.33,
    overtimeHours: 10,
    holidayHours: 0,
    additionalEarnings: 0,
    exchangeRate: 185.44,
    calc: null,
  },
  {
    id: "EMP-002",
    employeeNumber: "EMP-002",
    fullName: "Fanta Kamara",
    currency: "USD",
    rate: 12.00,
    regularHours: 173.33,
    overtimeHours: 0,
    holidayHours: 8,
    additionalEarnings: 50,
    exchangeRate: 185.44,
    calc: null,
  },
  {
    id: "EMP-003",
    employeeNumber: "EMP-003",
    fullName: "Emmanuel Toe",
    currency: "LRD",
    rate: 1200,
    regularHours: 173.33,
    overtimeHours: 5,
    holidayHours: 0,
    additionalEarnings: 0,
    exchangeRate: 185.44,
    calc: null,
  },
  {
    id: "EMP-004",
    employeeNumber: "EMP-004",
    fullName: "Massa Dolo",
    currency: "USD",
    rate: 6.00,   // below min wage → will trigger warning
    regularHours: 100,
    overtimeHours: 0,
    holidayHours: 0,
    additionalEarnings: 0,
    exchangeRate: 185.44,
    calc: null,
  },
];