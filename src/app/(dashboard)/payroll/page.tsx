"use client";

/**
 * Slipdesk — Payroll Page
 * Place at: src/app/(dashboard)/payroll/page.tsx
 */

import {
  useReducer, useMemo, useState, useCallback, useEffect, useRef,
} from "react";
import {
  createColumnHelper, flexRender,
  getCoreRowModel, useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle, CheckCircle2, Upload, ChevronRight,
  FileText, Lock, Play, Clock, Download, FileDown,
  Loader, Plus, Calendar, RefreshCw, DollarSign, Users,
} from "lucide-react";
import { calculatePayroll } from "@/lib/slipdesk-payroll-engine";
import type { PayRunLine } from "@/lib/mock-data";
import BulkUpload, { type BulkRow } from "@/components/BulkUpload";
import { employeeToPayrollInput } from "@/lib/payroll-adapter";
import { useApp } from "@/context/AppContext";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type RunStatus = "draft" | "review" | "approved" | "paid";

interface SavedRun {
  id:            string;
  periodLabel:   string;
  payDate:       string;
  status:        RunStatus;
  employeeCount: number;
  totalGross:    number;
  totalNet:      number;
  totalTax:      number;
  totalNasscorp: number;
  exchangeRate:  number;
  lines:         PayRunLine[];
  createdAt:     string;
}

type GridAction =
  | { type: "UPDATE_FIELD"; id: string; field: keyof PayRunLine; value: number }
  | { type: "IMPORT_ROWS";  rows: PayRunLine[] }
  | { type: "SET_ROWS";     rows: PayRunLine[] }
  | { type: "CLEAR" };

interface PdfCompany {
  name:          string;
  tin:           string;
  nasscorpRegNo: string;
  address:       string;
  phone:         string;
  email:         string;
  logoUrl:       string | null;
}

// ─── Number → words (for Net Pay in words line) ───────────────────────────────

function numberToWords(amount: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
                "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
                "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function toWords(n: number): string {
    if (n === 0) return "";
    if (n < 20)  return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + toWords(n % 100) : "");
  }

  const dollars = Math.floor(amount);
  const cents   = Math.round((amount - dollars) * 100);
  let result = "";
  if (dollars >= 1000) {
    result += toWords(Math.floor(dollars / 1000)) + " Thousand";
    if (dollars % 1000) result += " " + toWords(dollars % 1000);
  } else {
    result = toWords(dollars);
  }
  result = (result || "Zero") + " Dollar" + (dollars !== 1 ? "s" : "");
  if (cents > 0) result += " and " + toWords(cents) + " Cent" + (cents !== 1 ? "s" : "");
  return result;
}

// ─── BulkRow → PayRunLine mapper ──────────────────────────────────────────────

function bulkRowToPayRunLine(r: BulkRow, exchangeRate: number): PayRunLine {
  const emp    = r.employee;
  const tempId = `BULK-${emp.employeeNumber || Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id:                 tempId,
    employeeId:         tempId,
    employeeNumber:     emp.employeeNumber,
    fullName:           `${emp.firstName} ${emp.lastName}`.trim(),
    jobTitle:           emp.jobTitle,
    department:         emp.department,
    currency:           emp.currency,
    rate:               emp.rate,
    regularHours:       r.regularHours,
    overtimeHours:      r.overtimeHours,
    holidayHours:       r.holidayHours,
    additionalEarnings: emp.allowances ?? 0,
    exchangeRate,
    calc:               null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function recalcLine(line: PayRunLine): PayRunLine {
  try {
    const base = employeeToPayrollInput({
      id: line.employeeId, currency: line.currency,
      rate: line.rate, standardHours: line.regularHours,
    });
    const calc = calculatePayroll({
      ...base,
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
      return state.map((l) =>
        l.id !== action.id ? l : recalcLine({ ...l, [action.field]: action.value }),
      );
    case "IMPORT_ROWS": return [...state, ...action.rows.map(recalcLine)];
    case "SET_ROWS":    return action.rows.map(recalcLine);
    case "CLEAR":       return [];
    default:            return state;
  }
}

function fmtMoney(n: number, sym: string) {
  return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getCurrentPeriod() {
  const now   = new Date();
  const label = now.toLocaleDateString("en-LR", { year: "numeric", month: "long" });
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { label, payDate: last.toISOString().split("T")[0] };
}

function safePeriod(label: string) {
  return label.trim().replace(/\s+/g, "_");
}

// ─── PDF generation ───────────────────────────────────────────────────────────

let pdfLib: typeof import("@react-pdf/renderer") | null = null;
async function getPdfLib() {
  if (!pdfLib) pdfLib = await import("@react-pdf/renderer");
  return pdfLib;
}

interface PdfOptions {
  line:        PayRunLine;
  periodLabel: string;
  payDate:     string;
  company:     PdfCompany;
}

// NOTE: This function is called in a loop when bulk downloading, so we dynamically import the PDF library to avoid increasing the initial bundle size and only load it when needed. The generated PDF is returned as a Blob which can then be downloaded by the user. The payslip design is simple and clean, adhering to common standards while ensuring all necessary information is clearly presented.

async function generatePayslipBlob({ line, periodLabel, payDate, company }: PdfOptions): Promise<Blob> {
  const { Document, Page, Text, View, StyleSheet, pdf, Image } = await getPdfLib()!;
  const { calc, currency } = line;
  if (!calc) throw new Error("No calculation data");

  const sym     = currency === "USD" ? "$" : "L$";
  const fx      = line.exchangeRate;
  const NAVY    = "#002147";
  const EMERALD = "#50C878";
  const SLATE   = "#64748b";
  const LIGHT   = "#f8fafc";
  const BORDER  = "#e2e8f0";

  const S = StyleSheet.create({
    page:        { fontFamily: "Helvetica", fontSize: 9, color: "#1e293b", backgroundColor: "#fff", paddingHorizontal: 36, paddingVertical: 32 },
    header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: NAVY },
    coLeft:      { flexDirection: "row", alignItems: "center", gap: 10 },
    logo:        { width: 48, height: 48, objectFit: "contain" },
    coName:      { fontSize: 16, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 3 },
    coMeta:      { fontSize: 8, color: SLATE, lineHeight: 1.5 },
    badge:       { backgroundColor: NAVY, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 },
    badgeText:   { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fff", letterSpacing: 1 },
    infoGrid:    { flexDirection: "row", gap: 12, marginBottom: 18 },
    infoBox:     { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: 10, borderWidth: 1, borderColor: BORDER },
    infoLbl:     { fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
    infoVal:     { fontSize: 9, color: NAVY, fontFamily: "Helvetica-Bold" },
    infoSub:     { fontSize: 8, color: "#374151" },
    secTitle:    { fontSize: 8, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, marginTop: 14 },
    table:       { borderWidth: 1, borderColor: BORDER, borderRadius: 6, overflow: "hidden" },
    tHead:       { flexDirection: "row", backgroundColor: NAVY, paddingHorizontal: 10, paddingVertical: 6 },
    thDesc:      { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", width: 140 },
    thNotes:     { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", flex: 1 },
    thAmt:       { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", textAlign: "right", width: 90 },
    tRow:        { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER, alignItems: "flex-start" },
    tAlt:        { backgroundColor: LIGHT },
    tdDesc:      { width: 140, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY },
    tdNotes:     { flex: 1, fontSize: 8, color: "#374151", lineHeight: 1.6 },
    tdAmt:       { width: 90, fontSize: 8.5, color: "#374151", textAlign: "right" },
    tdAmtBold:   { width: 90, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY, textAlign: "right" },
    tdRed:       { width: 90, fontSize: 8.5, color: "#dc2626", textAlign: "right" },
    tdNote:      { flex: 1, fontSize: 7.5, color: SLATE, lineHeight: 1.5 },
    erBox:       { marginTop: 10, backgroundColor: LIGHT, borderRadius: 6, padding: 8, borderWidth: 1, borderColor: BORDER },
    erLabel:     { fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
    erRow:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    erText:      { fontSize: 7.5, color: SLATE },
    erAmount:    { fontSize: 8, fontFamily: "Helvetica-Bold", color: NAVY },
    netBox:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: NAVY, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12 },
    netLabel:    { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fff" },
    netValue:    { fontSize: 16, fontFamily: "Helvetica-Bold", color: EMERALD, textAlign: "right" },
    netWords:    { backgroundColor: "#f8fafc", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, marginTop: 6, borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 6 },
    netWordsLbl: { fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.4 },
    netWordsTxt: { fontSize: 8, color: NAVY, fontFamily: "Helvetica-Bold", flex: 1 },
    payBox:      { marginTop: 10, backgroundColor: "#f0fdf4", borderRadius: 6, padding: 8, borderWidth: 1, borderColor: "#86efac" },
    payLbl:      { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#166534", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
    payRow:      { flexDirection: "row", gap: 20, flexWrap: "wrap" },
    payItem:     { flex: 1, minWidth: 120 },
    payItemLbl:  { fontSize: 7, color: "#166534", marginBottom: 1 },
    payItemVal:  { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY },
    compRow:     { flexDirection: "row", gap: 8, marginTop: 10 },
    compBadge:   { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#86efac", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5 },
    compDot:     { width: 5, height: 5, borderRadius: 3, backgroundColor: EMERALD },
    compText:    { fontSize: 7.5, color: "#166534", fontFamily: "Helvetica-Bold" },
    sigSection:  { flexDirection: "row", gap: 30, marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: BORDER },
    sigBox:      { flex: 1 },
    sigLine:     { borderBottomWidth: 1, borderBottomColor: "#cbd5e1", marginBottom: 4, height: 20 },
    sigLabel:    { fontSize: 7.5, color: SLATE, textAlign: "center" },
    footer:      { marginTop: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    footerTxt:   { fontSize: 7, color: "#94a3b8" },
    footerBrand: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: NAVY },
  });

  const earningsRows = [
    { label: "Regular Salary",     note: `${line.regularHours} hrs × ${sym}${line.rate.toFixed(2)}/hr`,             amount: calc.regularSalary },
    ...(line.overtimeHours > 0 ? [{ label: "Overtime Pay",   note: `${line.overtimeHours} hrs × ${sym}${line.rate.toFixed(2)} × 1.5`, amount: calc.overtimePay }]  : []),
    ...(line.holidayHours  > 0 ? [{ label: "Holiday Pay",    note: `${line.holidayHours} hrs × ${sym}${line.rate.toFixed(2)} × 2.0`,  amount: calc.holidayPay }]   : []),
    ...(calc.additionalEarnings > 0 ? [{ label: "Allowances & Extras", note: "Recurring allowances + one-off earnings", amount: calc.additionalEarnings }] : []),
  ];

  const deductionRows = [
    {
      label:  "NASSCORP (Employee 4%)",
      note:   `4% of ${sym}${calc.nasscorp.base.toFixed(2)} regular salary`,
      amount: calc.nasscorp.employeeContribution,
    },
    {
      label:  "Income Tax (LRA)",
      note:   `Effective rate: ${(calc.Paye.effectiveRate * 100).toFixed(1)}%`,
      amount: calc.Paye.taxInBase,
    },
  ];

  const generated  = new Date().toLocaleDateString("en-LR", { year: "numeric", month: "long", day: "numeric" });
  const payDateFmt = new Date(payDate).toLocaleDateString("en-LR", { year: "numeric", month: "long", day: "numeric" });

  const netPayWords = numberToWords(calc.netPay);

  // ✅ UPDATED payment method block
  const paymentMethod: string | undefined = (line as any).paymentMethod;
  const methodLabel: Record<string, string> = {
    cash:          "Cash",
    bank_transfer: "Bank Transfer",
    orange_money:  "Orange Money",
    mtn_momo:      "Mobile Money (MTN)",
  };

  const doc = (
    <Document title={`Payslip - ${line.fullName} - ${periodLabel}`} author="Slipdesk">
      <Page size="A4" style={S.page}>

        <View style={S.header}>
          <View style={S.coLeft}>
            {company.logoUrl && <Image src={company.logoUrl} style={S.logo} />}
            <View>
              <Text style={S.coName}>{company.name || "Company Name"}</Text>
              {company.address       && <Text style={S.coMeta}>{company.address}</Text>}
              {company.tin           && <Text style={S.coMeta}>LRA TIN: {company.tin}</Text>}
              {company.nasscorpRegNo && <Text style={S.coMeta}>NASSCORP Reg: {company.nasscorpRegNo}</Text>}
              {company.phone         && <Text style={S.coMeta}>Tel: {company.phone}</Text>}
              {company.email         && <Text style={S.coMeta}>{company.email}</Text>}
            </View>
          </View>
          <View style={S.badge}><Text style={S.badgeText}>PAYSLIP</Text></View>
        </View>

        <View style={S.infoGrid}>
          <View style={S.infoBox}>
            <Text style={S.infoLbl}>Employee</Text>
            <Text style={S.infoVal}>{line.fullName}</Text>
            <Text style={S.infoSub}>{line.jobTitle}</Text>
            <Text style={S.infoSub}>{line.department}</Text>
          </View>
          <View style={S.infoBox}>
            <Text style={S.infoLbl}>Employee Number</Text>
            <Text style={S.infoVal}>{line.employeeNumber}</Text>
            <Text style={[S.infoLbl, { marginTop: 6 }]}>Pay Period</Text>
            <Text style={S.infoSub}>{periodLabel}</Text>
          </View>
          <View style={S.infoBox}>
            <Text style={S.infoLbl}>Pay Date</Text>
            <Text style={S.infoVal}>{payDateFmt}</Text>
            <Text style={[S.infoLbl, { marginTop: 6 }]}>Currency</Text>
            <Text style={S.infoSub}>{currency}</Text>
          </View>
        </View>

        <Text style={S.secTitle}>Earnings</Text>
        <View style={S.table}>
          <View style={S.tHead}>
            <Text style={S.thDesc}>Description</Text>
            <Text style={S.thNotes}>Notes</Text>
            <Text style={S.thAmt}>Amount ({currency})</Text>
          </View>
          {earningsRows.map((row, i) => (
            <View key={row.label} style={[S.tRow, i % 2 === 1 ? S.tAlt : {}]}>
              <Text style={S.tdDesc}>{row.label}</Text>
              <Text style={S.tdNotes}>{row.note}</Text>
              <Text style={S.tdAmt}>{fmtMoney(row.amount, sym)}</Text>
            </View>
          ))}
          <View style={[S.tRow, { backgroundColor: "#f0fdf4" }]}>
            <Text style={S.tdDesc}>GROSS PAY</Text>
            <Text style={S.tdNotes}>{" "}</Text>
            <Text style={S.tdAmtBold}>{fmtMoney(calc.grossPay, sym)}</Text>
          </View>
        </View>

        <Text style={S.secTitle}>Deductions</Text>
        <View style={S.table}>
          <View style={S.tHead}>
            <Text style={S.thDesc}>Description</Text>
            <Text style={S.thNotes}>Basis</Text>
            <Text style={S.thAmt}>Amount ({currency})</Text>
          </View>
          {deductionRows.map((row, i) => (
            <View key={row.label} style={[S.tRow, i % 2 === 1 ? S.tAlt : {}]}>
              <Text style={S.tdDesc}>{row.label}</Text>
              <Text style={S.tdNote}>{row.note}</Text>
              <Text style={S.tdRed}>({fmtMoney(row.amount, sym)})</Text>
            </View>
          ))}
          <View style={[S.tRow, { backgroundColor: "#fff7ed" }]}>
            <Text style={S.tdDesc}>TOTAL DEDUCTIONS</Text>
            <Text style={S.tdNotes}>{" "}</Text>
            <Text style={[S.tdRed, { fontFamily: "Helvetica-Bold" }]}>({fmtMoney(calc.totalDeductions, sym)})</Text>
          </View>
        </View>

        <View style={S.erBox}>
          <Text style={S.erLabel}>Employer Contributions (not deducted from employee)</Text>
          <View style={S.erRow}>
            <Text style={S.erText}>
              NASSCORP Employer (6% of {sym}{calc.nasscorp.base.toFixed(2)} regular salary)
            </Text>
            <Text style={S.erAmount}>{fmtMoney(calc.nasscorp.employerContribution, sym)}</Text>
          </View>
        </View>

        {/* ─── UPDATED PAYMENT METHOD BLOCK ───────────────────────────────── */}
        {paymentMethod && methodLabel[paymentMethod] && (
          <View style={S.payBox}>
            <Text style={S.payLbl}>Payment Method</Text>
            <View style={S.payRow}>
              <View style={S.payItem}>
                <Text style={S.payItemLbl}>Method</Text>
                <Text style={S.payItemVal}>{methodLabel[paymentMethod]}</Text>
              </View>

              {/* Bank: show Bank Name and Account Number */}
              {paymentMethod === "bank_transfer" && (line as any).bankName && (
                <View style={S.payItem}>
                  <Text style={S.payItemLbl}>Bank</Text>
                  <Text style={S.payItemVal}>{(line as any).bankName}</Text>
                </View>
              )}
              {paymentMethod === "bank_transfer" && (line as any).accountNumber && (
                <View style={S.payItem}>
                  <Text style={S.payItemLbl}>Account Number</Text>
                  <Text style={S.payItemVal}>{(line as any).accountNumber}</Text>
                </View>
              )}

              {/* Mobile money: show Mobile Number and Provider */}
              {(paymentMethod === "orange_money" || paymentMethod === "mtn_momo") && (
                <>
                  {(line as any).mobileNumber && (
                    <View style={S.payItem}>
                      <Text style={S.payItemLbl}>Mobile Number</Text>
                      <Text style={S.payItemVal}>{(line as any).mobileNumber}</Text>
                    </View>
                  )}
                  <View style={S.payItem}>
                    <Text style={S.payItemLbl}>Provider</Text>
                    <Text style={S.payItemVal}>
                      {(line as any).mobileProvider || (paymentMethod === "orange_money" ? "Orange Money" : "Lonestar MTN")}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        <View style={S.netBox}>
          <Text style={S.netLabel}>NET PAY</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={S.netValue}>{fmtMoney(calc.netPay, sym)}</Text>
          </View>
        </View>

        <View style={S.netWords}>
          <Text style={S.netWordsLbl}>In Words: </Text>
          <Text style={S.netWordsTxt}>{netPayWords}</Text>
        </View>

        <View style={S.compRow}>
          <View style={S.compBadge}><View style={S.compDot} /><Text style={S.compText}>LRA Income Tax Compliant</Text></View>
          <View style={S.compBadge}><View style={S.compDot} /><Text style={S.compText}>NASSCORP Verified</Text></View>
          <View style={S.compBadge}><View style={S.compDot} /><Text style={S.compText}>{"Generated by Slipdesk · " + generated}</Text></View>
        </View>

        <View style={S.sigSection}>
          {["Authorised Signatory", "Date", "Employee Acknowledgement"].map((label) => (
            <View key={label} style={S.sigBox}>
              <View style={S.sigLine} />
              <Text style={S.sigLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={S.footer}>
          <Text style={S.footerTxt}>This payslip is computer-generated and is valid without a physical signature.</Text>
          <Text style={S.footerBrand}>Slipdesk · slipdesk.com</Text>
        </View>
      </Page>
    </Document>
  );

  return await pdf(doc).toBlob();
}

// ─── Download helpers ─────────────────────────────────────────────────────────

function buildFilename(fullName: string, periodLabel: string) {
  return `${fullName.trim().replace(/\s+/g, "_")}_Payslip_${safePeriod(periodLabel)}.pdf`;
}

function DownloadSlipButton({ line, periodLabel, payDate, company }: {
  line: PayRunLine; periodLabel: string; payDate: string; company: PdfCompany;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  async function handle() {
    if (!line.calc) return;
    setLoading(true);
    try {
      const blob = await generatePayslipBlob({ line, periodLabel, payDate, company });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = buildFilename(line.fullName, periodLabel); a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); toast.error("Could not generate payslip. Try again."); }
    finally { setLoading(false); }
  }
  return (
    <button
      onClick={handle}
      disabled={loading || !line.calc}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono
                 text-slate-500 hover:text-[#002147] hover:bg-emerald-50
                 disabled:opacity-40 disabled:cursor-not-allowed transition-all group"
    >
      {loading
        ? <Loader className="w-3.5 h-3.5 animate-spin text-emerald-500" />
        : <FileDown className="w-3.5 h-3.5 group-hover:text-emerald-600" />}
      <span className="hidden sm:inline">{loading ? "…" : "PDF"}</span>
    </button>
  );
}

function BulkDownloadButton({ lines, periodLabel, payDate, company }: {
  lines: PayRunLine[]; periodLabel: string; payDate: string; company: PdfCompany;
}) {
  const { toast } = useToast();
  const [loading,  setLoading]  = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const valid = lines.filter((l) => l.calc !== null);

  async function handleAll() {
    if (!valid.length) return;
    setLoading(true); setProgress({ done: 0, total: valid.length });
    try {
      for (let i = 0; i < valid.length; i++) {
        const blob = await generatePayslipBlob({ line: valid[i], periodLabel, payDate, company });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = buildFilename(valid[i].fullName, periodLabel); a.click();
        URL.revokeObjectURL(url);
        setProgress({ done: i + 1, total: valid.length });
        await new Promise((r) => setTimeout(r, 350));
      }
    } catch (e) { console.error(e); toast.error("Some payslips could not be generated."); }
    finally { setLoading(false); setProgress({ done: 0, total: 0 }); }
  }

  return (
    <button
      onClick={handleAll}
      disabled={loading || !valid.length}
      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl
                 bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading
        ? <><Loader className="w-3.5 h-3.5 animate-spin" />{progress.total > 0 ? `${progress.done}/${progress.total} payslips…` : "Generating…"}</>
        : <><Download className="w-3.5 h-3.5" />All Payslips ({valid.length})</>}
    </button>
  );
}

// ─── Editable cell ────────────────────────────────────────────────────────────

function EditableCell({ value, lineId, field, isLocked, dispatch, prefix = "", decimals = 2 }: {
  value: number; lineId: string; field: keyof PayRunLine; isLocked: boolean;
  dispatch: React.Dispatch<GridAction>; prefix?: string; decimals?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(String(value));

  const commit = useCallback(() => {
    const num = parseFloat(local);
    if (!isNaN(num) && num >= 0) dispatch({ type: "UPDATE_FIELD", id: lineId, field, value: num });
    else setLocal(String(value));
    setEditing(false);
  }, [local, lineId, field, value, dispatch]);

  if (isLocked) return (
    <span className="block text-right font-mono text-xs text-slate-400">{prefix}{value.toFixed(decimals)}</span>
  );
  if (editing) return (
    <input
      autoFocus
      value={local}
      className="w-full text-right font-mono text-xs bg-emerald-50 border border-emerald-400 rounded px-1.5 py-0.5 focus:outline-none"
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setLocal(String(value)); setEditing(false); }
      }}
    />
  );
  return (
    <button
      onClick={() => { setLocal(String(value)); setEditing(true); }}
      className="w-full text-right font-mono text-xs text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 rounded px-1.5 py-0.5 cursor-text"
    >
      {prefix}{value.toFixed(decimals)}
    </button>
  );
}

// ─── Run summary ──────────────────────────────────────────────────────────────

function RunSummary({ lines, exchangeRate }: { lines: PayRunLine[]; exchangeRate: number }) {
  const t = useMemo(() => lines.reduce((acc, l) => {
    if (!l.calc) return acc;
    const u = (n: number) => l.currency === "USD" ? n : n / exchangeRate;
    return {
      gross:    acc.gross    + u(l.calc.grossPay),
      nasscorp: acc.nasscorp + u(l.calc.nasscorp.employeeContribution),
      erNasc:   acc.erNasc   + u(l.calc.nasscorp.employerContribution),
      tax:      acc.tax      + u(l.calc.Paye.taxInBase),
      net:      acc.net      + u(l.calc.netPay),
    };
  }, { gross: 0, nasscorp: 0, erNasc: 0, tax: 0, net: 0 }), [lines, exchangeRate]);

  const f = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="bg-[#002147] rounded-b-2xl px-4 py-3.5">
      <div className="flex flex-wrap gap-x-5 gap-y-2 items-center">
        <span className="text-white/30 text-[9px] font-mono uppercase tracking-widest mr-auto hidden sm:block">USD Equiv. Totals</span>
        {[
          { label: "Gross",            value: f(t.gross),    color: "text-white"      },
          { label: "NASSCORP (EE)",    value: f(t.nasscorp), color: "text-orange-300" },
          { label: "NASSCORP (ER)",    value: f(t.erNasc),   color: "text-orange-400" },
          { label: "Income Tax (LRA)", value: f(t.tax),      color: "text-red-300"    },
          { label: "Net Pay",          value: f(t.net),      color: "text-[#50C878]"  },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-[9px] font-mono text-white/30 uppercase">{item.label}</p>
            <p className={`font-mono font-bold text-sm ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status stepper ───────────────────────────────────────────────────────────

const STATUS_STEPS:  RunStatus[]               = ["draft", "review", "approved", "paid"];
const STATUS_LABELS: Record<RunStatus, string> = { draft: "Draft", review: "In Review", approved: "Approved", paid: "Paid" };
const NEXT_LABELS:   Record<RunStatus, string> = { draft: "Submit for Review", review: "Approve Pay Run", approved: "Mark as Paid", paid: "Completed" };

function StatusStepper({ current, onAdvance, saving = false }: {
  current: RunStatus; onAdvance: () => void; saving?: boolean;
}) {
  const idx = STATUS_STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1 flex-wrap">
        {STATUS_STEPS.map((step, i) => {
          const done = i < idx; const active = i === idx;
          return (
            <div key={step} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono
                ${active ? "bg-[#50C878] text-[#002147] font-bold" : done ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                {done && <CheckCircle2 className="w-3 h-3" />}
                {STATUS_LABELS[step]}
              </div>
              {i < STATUS_STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </div>
          );
        })}
      </div>
      {current !== "paid" && (
        <button
          onClick={onAdvance}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold
                     bg-[#002147] text-white hover:bg-[#002147]/80 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving
            ? <><Loader className="w-3 h-3 animate-spin" />Saving…</>
            : <><Play className="w-3 h-3" />{NEXT_LABELS[current]}</>}
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const { employees, company } = useApp();
  const { toast } = useToast();

  const pdfCompany: PdfCompany = {
    name:          company.name,
    tin:           company.tin,
    nasscorpRegNo: company.nasscorpRegNo,
    address:       company.address,
    phone:         company.phone,
    email:         company.email,
    logoUrl:       company.logoUrl,
  };

  const defaultPeriod = getCurrentPeriod();
  const [periodLabel,  setPeriodLabel]  = useState(defaultPeriod.label);
  const [payDate,      setPayDate]      = useState(defaultPeriod.payDate);
  const [exchangeRate, setExchangeRate] = useState(185.44);
  const [runStarted,   setRunStarted]   = useState(false);
  const [lines,        dispatch]        = useReducer(gridReducer, []);
  const [status,       setStatus]       = useState<RunStatus>("draft");
  const [showUpload,   setShowUpload]   = useState(false);
  const [history,      setHistory]      = useState<SavedRun[]>([]);
  const [saving,       setSaving]       = useState(false);

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const supabase = sbRef.current;

  useEffect(() => {
    async function loadHistory() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("pay_runs")
        .select("*")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!data) return;
      setHistory(data.map((r: any) => ({
        id:            r.id,
        periodLabel:   r.period_label,
        payDate:       r.pay_date,
        status:        r.status,
        employeeCount: r.employee_count,
        totalGross:    r.total_gross,
        totalNet:      r.total_net,
        totalTax:      r.total_income_tax,
        totalNasscorp: r.total_nasscorp,
        exchangeRate:  r.exchange_rate,
        lines:         [],
        createdAt:     r.created_at,
      })));
    }
    loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLocked        = status === "approved" || status === "paid";
  const warningCount    = lines.filter((l) => l.calc && l.calc.warnings.length > 0).length;
  const activeEmployees = employees.filter((e) => e.isActive);

  function handleStartRun() {
  const rows: PayRunLine[] = activeEmployees.map((emp) => ({
    id:                 emp.id,
    employeeId:         emp.id,
    employeeNumber:     emp.employeeNumber,
    fullName:           emp.fullName,
    jobTitle:           emp.jobTitle,
    department:         emp.department,
    currency:           emp.currency,
    rate:               emp.rate,
    regularHours:       emp.standardHours,
    overtimeHours:      0,
    holidayHours:       0,
    additionalEarnings: emp.allowances ?? 0,
    exchangeRate,
    calc:               null,
    // Payment method fields – use correct source field names
    paymentMethod:      (emp as any).paymentMethod,
    bankName:           (emp as any).bankName,
    accountNumber:      (emp as any).accountNumber,      
    mobileNumber:       (emp as any).momoNumber,         
    mobileProvider:     (emp as any).mobileProvider,    
  }));
  dispatch({ type: "SET_ROWS", rows });
  setRunStarted(true);
}

  async function advanceStatus() {
    const idx  = STATUS_STEPS.indexOf(status);
    if (idx >= STATUS_STEPS.length - 1) return;
    const next = STATUS_STEPS[idx + 1];
    setStatus(next);

    if (next === "paid") {
      setSaving(true);
      try {
        const FX    = exchangeRate;
        const toUSD = (n: number, ccy: string) => ccy === "USD" ? n : n / FX;

        const totalGross    = lines.reduce((s, l) => s + (l.calc ? toUSD(l.calc.grossPay,                       l.currency) : 0), 0);
        const totalNet      = lines.reduce((s, l) => s + (l.calc ? toUSD(l.calc.netPay,                         l.currency) : 0), 0);
        const totalTax      = lines.reduce((s, l) => s + (l.calc ? toUSD(l.calc.Paye.taxInBase,                 l.currency) : 0), 0);
        const totalNasscorp = lines.reduce((s, l) => s + (l.calc ? toUSD(l.calc.nasscorp.employeeContribution,  l.currency) : 0), 0);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: run, error: runErr } = await (supabase as any)
          .from("pay_runs")
          .insert({
            period_label:     periodLabel,
            pay_period_start: payDate,
            pay_period_end:   payDate,
            pay_date:         payDate,
            exchange_rate:    FX,
            status:           "paid",
            employee_count:   lines.length,
            total_gross:      totalGross,
            total_net:        totalNet,
            total_income_tax: totalTax,
            total_nasscorp:   totalNasscorp,
          })
          .select()
          .single();

        if (runErr) throw runErr;

        if (run && lines.length > 0) {
          const lineRows = lines
            .filter((l) => l.calc !== null)
            .map((l) => ({
              pay_run_id:          run.id,
              employee_id:         l.employeeId,
              employee_number:     l.employeeNumber,
              full_name:           l.fullName,
              job_title:           l.jobTitle,
              department:          l.department,
              currency:            l.currency,
              rate:                l.rate,
              regular_hours:       l.regularHours,
              overtime_hours:      l.overtimeHours,
              holiday_hours:       l.holidayHours,
              additional_earnings: l.additionalEarnings,
              exchange_rate:       l.exchangeRate,
              gross_pay:           l.calc!.grossPay,
              income_tax:          l.calc!.Paye.taxInBase,
              nasscorp_ee:         l.calc!.nasscorp.employeeContribution,
              nasscorp_er:         l.calc!.nasscorp.employerContribution,
              net_pay:             l.calc!.netPay,
            }));

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: lineErr } = await (supabase as any)
            .from("pay_run_lines")
            .insert(lineRows);

          if (lineErr) {
            console.error("pay_run_lines insert error:", lineErr);
            toast.error("Pay run saved but some line items failed to record.");
          }
        }

        const savedRun: SavedRun = {
          id:            run?.id ?? `LOCAL-${Date.now()}`,
          periodLabel,   payDate,  status: "paid",
          employeeCount: lines.length,
          totalGross, totalNet, totalTax, totalNasscorp,
          exchangeRate:  FX,
          lines:         [...lines],
          createdAt:     new Date().toISOString(),
        };
        setHistory((prev) => [savedRun, ...prev]);
        toast.success(`${periodLabel} pay run saved. ${lines.length} employee${lines.length !== 1 ? "s" : ""} paid.`);

      } catch (err) {
        console.error("Failed to save pay run:", err);
        toast.error("Pay run marked as paid locally but could not be saved to Supabase.");
      } finally {
        setSaving(false);
      }
    }
  }

  function startNewRun() {
    dispatch({ type: "CLEAR" }); setStatus("draft");
    const p = getCurrentPeriod(); setPeriodLabel(p.label); setPayDate(p.payDate);
    setRunStarted(false);
  }

  // ── Columns ───────────────────────────────────────────────────────────────
  const col = createColumnHelper<PayRunLine>();
  const columns = useMemo(() => [
    col.accessor("employeeNumber", { header: "#", size: 64,
      cell: (c) => <span className="font-mono text-[10px] text-slate-400">{c.getValue()}</span> }),
    col.accessor("fullName", { header: "Name", size: 148,
      cell: (c) => (
        <div>
          <p className="text-xs font-medium text-slate-700 leading-tight truncate max-w-[130px]">{c.getValue()}</p>
          <p className="text-[10px] text-slate-400 truncate max-w-[130px]">{c.row.original.department}</p>
        </div>
      ) }),
    col.accessor("currency", { header: "CCY", size: 48,
      cell: (c) => (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.getValue() === "USD" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
          {c.getValue()}
        </span>
      ) }),
    col.accessor("rate", { header: "Rate/hr", size: 78,
      cell: (c) => <EditableCell value={c.getValue()} lineId={c.row.original.id} field="rate" dispatch={dispatch} isLocked={isLocked} prefix={c.row.original.currency === "USD" ? "$" : "L$"} /> }),
    col.accessor("regularHours",  { header: "Reg Hrs",  size: 70,
      cell: (c) => <EditableCell value={c.getValue()} lineId={c.row.original.id} field="regularHours"  dispatch={dispatch} isLocked={isLocked} /> }),
    col.accessor("overtimeHours", { header: "OT Hrs",   size: 64,
      cell: (c) => <EditableCell value={c.getValue()} lineId={c.row.original.id} field="overtimeHours" dispatch={dispatch} isLocked={isLocked} /> }),
    col.accessor("holidayHours",  { header: "Hol Hrs",  size: 64,
      cell: (c) => <EditableCell value={c.getValue()} lineId={c.row.original.id} field="holidayHours"  dispatch={dispatch} isLocked={isLocked} /> }),
    col.accessor("additionalEarnings", { header: "Extras", size: 70,
      cell: (c) => <EditableCell value={c.getValue()} lineId={c.row.original.id} field="additionalEarnings" dispatch={dispatch} isLocked={isLocked} prefix={c.row.original.currency === "USD" ? "$" : "L$"} /> }),
    col.display({ id: "gross", header: "Gross", size: 86,
      cell: (c) => { const sym = c.row.original.currency === "USD" ? "$" : "L$";
        return <span className="block text-right font-mono text-xs font-semibold text-slate-700">{c.row.original.calc ? `${sym}${c.row.original.calc.grossPay.toFixed(2)}` : "—"}</span>; } }),
    col.display({ id: "nasc", header: "NASSCORP", size: 84,
      cell: (c) => { const sym = c.row.original.currency === "USD" ? "$" : "L$";
        return <span className="block text-right font-mono text-xs text-orange-500">{c.row.original.calc ? `${sym}${c.row.original.calc.nasscorp.employeeContribution.toFixed(2)}` : "—"}</span>; } }),
    col.display({ id: "tax", header: "Income Tax", size: 84,
      cell: (c) => { const sym = c.row.original.currency === "USD" ? "$" : "L$"; const calc = c.row.original.calc;
        return (
          <div className="text-right">
            <span className="font-mono text-xs text-red-500">{calc ? `${sym}${calc.Paye.taxInBase.toFixed(2)}` : "—"}</span>
            {calc && calc.Paye.effectiveRate > 0 && <p className="text-[9px] text-slate-400 font-mono">{(calc.Paye.effectiveRate * 100).toFixed(1)}%</p>}
          </div>
        ); } }),
    col.display({ id: "net", header: "Net Pay", size: 94,
      cell: (c) => { const sym = c.row.original.currency === "USD" ? "$" : "L$";
        return <span className="block text-right font-mono text-xs font-bold text-emerald-600">{c.row.original.calc ? `${sym}${c.row.original.calc.netPay.toFixed(2)}` : "—"}</span>; } }),
    col.display({ id: "slip", header: "Payslip", size: 72,
      cell: (c) => <DownloadSlipButton line={c.row.original} periodLabel={periodLabel} payDate={payDate} company={pdfCompany} /> }),
    col.display({ id: "warn", header: "", size: 28,
      cell: (c) => { const warnings = c.row.original.calc?.warnings ?? [];
        if (!warnings.length) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" />;
        return (
          <div className="relative group mx-auto w-fit">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 cursor-pointer" />
            <div className="absolute right-0 top-5 z-50 hidden group-hover:block w-64 bg-white shadow-xl border border-amber-100 rounded-xl p-3 text-xs text-amber-700 space-y-1">
              {warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          </div>
        ); } }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isLocked, periodLabel, payDate, pdfCompany.logoUrl]);

  const table = useReactTable({ data: lines, columns, getCoreRowModel: getCoreRowModel() });

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (!runStarted) {
    return (
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Payroll</h1>
          <p className="text-slate-400 text-sm mt-0.5">Configure and start a new pay run</p>
        </div>

        {activeEmployees.length === 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">No active employees</p>
              <p className="text-xs text-amber-600 mt-0.5">Add employees on the <strong>Employees</strong> page first.</p>
            </div>
          </div>
        )}

        {activeEmployees.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3">
            <Users className="w-4 h-4 text-[#50C878] flex-shrink-0" />
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{activeEmployees.length} active employee{activeEmployees.length !== 1 ? "s" : ""}</span>
              {" "}will be loaded. Recurring allowances pre-fill in the Extras column.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 max-w-lg">
          <h2 className="font-semibold text-slate-800">New Pay Run</h2>
          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">Pay Period Label</label>
            <input
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              placeholder="e.g. July 2025"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">Pay Date</label>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">LRD / USD Exchange Rate</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="number"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 185.44)}
                placeholder="185.44"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">Used to convert LRD salaries for Income Tax (LRA) calculation</p>
          </div>
          <button
            onClick={handleStartRun}
            disabled={activeEmployees.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-xl
                       bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-4 h-4" />
            Start Pay Run for {periodLabel}{activeEmployees.length > 0 && ` · ${activeEmployees.length} employees`}
          </button>
        </div>

        {history.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" /> Pay Run History
            </h2>
            <div className="space-y-1">
              {history.map((run) => (
                <div key={run.id} className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700">{run.periodLabel}</p>
                    <p className="text-xs text-slate-400 font-mono">
                      {run.employeeCount} emp
                      {" · "}Gross ${run.totalGross.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      {" · "}Net ${run.totalNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      {run.totalTax      ? ` · Tax $${run.totalTax.toLocaleString("en-US",      { minimumFractionDigits: 2 })}` : ""}
                      {run.totalNasscorp ? ` · NASC $${run.totalNasscorp.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {run.lines.length > 0 && (
                      <BulkDownloadButton lines={run.lines} periodLabel={run.periodLabel} payDate={run.payDate} company={pdfCompany} />
                    )}
                    <span className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">paid</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Active pay run ────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Payroll</h1>
          <p className="text-slate-400 text-sm mt-0.5 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" /> {periodLabel} · {lines.length} employees
            <span className="text-slate-300">·</span>
            <RefreshCw className="w-3.5 h-3.5" /> L${exchangeRate} per $1
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {status === "paid" && (
            <button
              onClick={startNewRun}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"
            >
              <Plus className="w-3.5 h-3.5" /> New Pay Run
            </button>
          )}
          {!isLocked && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
          )}
          <BulkDownloadButton lines={lines} periodLabel={periodLabel} payDate={payDate} company={pdfCompany} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
        <StatusStepper current={status} onAdvance={advanceStatus} saving={saving} />
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3.5">
        <FileDown className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-600 leading-relaxed">
          Employees loaded from your registry · allowances pre-filled in Extras. Click any cell to edit —
          NASSCORP, Income Tax (LRA) and Net Pay recalculate instantly. Use <strong>Import CSV</strong> to add extra rows with hours pre-filled.
        </p>
      </div>

      {warningCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            <strong>{warningCount} employee{warningCount > 1 ? "s" : ""}</strong> have gross pay below the $150 USD minimum wage. Review before approving.
          </p>
        </div>
      )}

      {isLocked && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5">
          <Lock className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700">Pay run is <strong>{status}</strong>. Figures are locked. You can still download payslips.</p>
        </div>
      )}

      {lines.length > 0 && (
        <>
          <div className="bg-white rounded-t-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-[#002147] text-white">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-white/40" />
                <span className="text-sm font-semibold">Review & Edit Payroll</span>
                {!isLocked && <span className="text-[10px] font-mono text-white/30 hidden sm:inline">Click rate or hours to edit</span>}
              </div>
              {warningCount > 0 && (
                <span className="text-[10px] font-mono text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {warningCount} warning{warningCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="bg-slate-50 border-b border-slate-200">
                      {hg.headers.map((h) => (
                        <th key={h.id} style={{ width: h.getSize() }}
                          className="px-3 py-2.5 text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row, i) => (
                    <tr key={row.id}
                      className={`border-b border-slate-100 transition-colors
                        ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-emerald-50/20
                        ${row.original.calc?.warnings.length ? "border-l-2 border-l-amber-400" : "border-l-2 border-l-transparent"}`}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5" style={{ width: cell.column.getSize() }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card stack */}
            <div className="sm:hidden divide-y divide-slate-100">
              {lines.map((line) => {
                const sym     = line.currency === "USD" ? "$" : "L$";
                const hasWarn = (line.calc?.warnings.length ?? 0) > 0;
                return (
                  <div key={line.id} className={`p-4 ${hasWarn ? "border-l-2 border-l-amber-400" : ""}`}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{line.fullName}</p>
                        <p className="text-xs text-slate-400 truncate">{line.jobTitle} · {line.department}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${line.currency === "USD" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                          {line.currency}
                        </span>
                        {hasWarn && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
                      <div>
                        <p className="text-[10px] font-mono text-slate-400 uppercase mb-0.5">Rate/hr</p>
                        <EditableCell value={line.rate} lineId={line.id} field="rate" dispatch={dispatch} isLocked={isLocked} prefix={line.currency === "USD" ? "$" : "L$"} />
                      </div>
                      <div>
                        <p className="text-[10px] font-mono text-slate-400 uppercase mb-0.5">Reg Hrs</p>
                        <EditableCell value={line.regularHours} lineId={line.id} field="regularHours" dispatch={dispatch} isLocked={isLocked} />
                      </div>
                      <div>
                        <p className="text-[10px] font-mono text-slate-400 uppercase mb-0.5">OT Hrs</p>
                        <EditableCell value={line.overtimeHours} lineId={line.id} field="overtimeHours" dispatch={dispatch} isLocked={isLocked} />
                      </div>
                      <div>
                        <p className="text-[10px] font-mono text-slate-400 uppercase mb-0.5">Extras</p>
                        <EditableCell value={line.additionalEarnings} lineId={line.id} field="additionalEarnings" dispatch={dispatch} isLocked={isLocked} prefix={line.currency === "USD" ? "$" : "L$"} />
                      </div>
                    </div>
                    {line.calc && (
                      <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 text-xs font-mono">
                        <div className="text-center">
                          <p className="text-slate-400 text-[10px] uppercase">Gross</p>
                          <p className="font-semibold text-slate-700">{sym}{line.calc.grossPay.toFixed(2)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-400 text-[10px] uppercase">Tax</p>
                          <p className="text-red-500">{sym}{line.calc.Paye.taxInBase.toFixed(2)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-400 text-[10px] uppercase">NASC</p>
                          <p className="text-orange-500">{sym}{line.calc.nasscorp.employeeContribution.toFixed(2)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-400 text-[10px] uppercase">Net</p>
                          <p className="font-bold text-emerald-600">{sym}{line.calc.netPay.toFixed(2)}</p>
                        </div>
                        <DownloadSlipButton line={line} periodLabel={periodLabel} payDate={payDate} company={pdfCompany} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <RunSummary lines={lines} exchangeRate={exchangeRate} />
        </>
      )}

      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" /> Pay Run History
          </h2>
          <div className="space-y-1">
            {history.map((run) => (
              <div key={run.id} className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">{run.periodLabel}</p>
                  <p className="text-xs text-slate-400 font-mono">
                    {run.employeeCount} emp
                    {" · "}Gross ${run.totalGross.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    {" · "}Net ${run.totalNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    {run.totalTax      ? ` · Tax $${run.totalTax.toLocaleString("en-US",       { minimumFractionDigits: 2 })}` : ""}
                    {run.totalNasscorp ? ` · NASC $${run.totalNasscorp.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {run.lines.length > 0 && (
                    <BulkDownloadButton lines={run.lines} periodLabel={run.periodLabel} payDate={run.payDate} company={pdfCompany} />
                  )}
                  <span className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">paid</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showUpload && (
        <BulkUpload
          onClose={() => setShowUpload(false)}
          onImport={(bulkRows) => {
            const payRunLines = bulkRows.map((r) => bulkRowToPayRunLine(r, exchangeRate));
            dispatch({ type: "IMPORT_ROWS", rows: payRunLines });
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}