"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { useState } from "react";
import { FileText, Download, Loader } from "lucide-react";
import type { PayRunLine } from "@/lib/mock-data";

export interface CompanyInfo {
  name: string;
  tin?: string;
  nasscorpRegNo?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export type PaymentMethod = "cash" | "bank_transfer" | "orange_money" | "mtn_momo";

export interface PaymentDetails {
  method:           PaymentMethod;
  // Bank
  bankName?:        string;
  accountNumber?:   string;   // ✅ matches database column "account_number"
  // Mobile money
  mobileNumber?:    string;
  mobileProvider?:  string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, sym: string): string {
  return `${sym}${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-LR", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

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

// ─── Colors ───────────────────────────────────────────────────────────────────

const NAVY    = "#002147";
const EMERALD = "#50C878";
const SLATE   = "#64748b";
const LIGHT   = "#f8fafc";
const BORDER  = "#e2e8f0";

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    backgroundColor: "#ffffff",
    paddingHorizontal: 36,
    paddingVertical: 32,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: NAVY,
  },
  companyName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 3,
  },
  companyMeta: {
    fontSize: 8,
    color: SLATE,
    lineHeight: 1.5,
  },
  payslipBadge: {
    backgroundColor: NAVY,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  payslipBadgeText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 1,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  infoBox: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  infoLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 9,
    color: NAVY,
    fontFamily: "Helvetica-Bold",
  },
  infoValueLight: {
    fontSize: 8,
    color: "#374151",
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 14,
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: NAVY,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  thDesc: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    width: 140,
  },
  thNotes: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    flex: 1,
  },
  thAmount: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    width: 90,
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    alignItems: "flex-start",
  },
  tableRowAlt: {
    backgroundColor: LIGHT,
  },
  tdDesc: {
    width: 140,
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
  },
  tdNotes: {
    flex: 1,
    fontSize: 8,
    color: "#374151",
    lineHeight: 1.6,
  },
  tdAmount: {
    width: 90,
    fontSize: 8.5,
    color: "#374151",
    textAlign: "right",
  },
  tdAmountBold: {
    width: 90,
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    textAlign: "right",
  },
  tdDeduction: {
    width: 90,
    fontSize: 8.5,
    color: "#dc2626",
    textAlign: "right",
  },
  tdNote: {
    flex: 1,
    fontSize: 7.5,
    color: SLATE,
    lineHeight: 1.5,
  },
  erBox: {
    marginTop: 10,
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  erBoxLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  erRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  erText: {
    fontSize: 7.5,
    color: SLATE,
  },
  erAmount: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
  },
  // Payment method box
  paymentBox: {
    marginTop: 10,
    backgroundColor: "#f0fdf4",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  paymentBoxLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#166534",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  paymentRow: {
    flexDirection: "row",
    gap: 20,
    flexWrap: "wrap",
  },
  paymentItem: {
    minWidth: 120,
    flex: 1,
  },
  paymentItemLabel: {
    fontSize: 7,
    color: "#166534",
    marginBottom: 1,
  },
  paymentItemValue: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
  },
  netBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: NAVY,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  netLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  netRight: {
    alignItems: "flex-end",
  },
  netValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: EMERALD,
    textAlign: "right",
  },
  netWordsBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 6,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  netWordsLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  netWordsText: {
    fontSize: 8,
    color: NAVY,
    fontFamily: "Helvetica-Bold",
    flex: 1,
  },
  complianceRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  complianceBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#86efac",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  complianceDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: EMERALD,
  },
  complianceText: {
    fontSize: 7.5,
    color: "#166534",
    fontFamily: "Helvetica-Bold",
  },
  signatureSection: {
    flexDirection: "row",
    gap: 30,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  signatureBox: { flex: 1 },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    marginBottom: 4,
    height: 20,
  },
  signatureLabel: {
    fontSize: 7.5,
    color: SLATE,
    textAlign: "center",
  },
  footer: {
    marginTop: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText:  { fontSize: 7,   color: "#94a3b8" },
  footerBrand: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: NAVY },
});

interface PayslipDocProps {
  line:          PayRunLine;
  company:       CompanyInfo;
  payDate:       string;
  periodLabel?:  string;
  payment?:      PaymentDetails;
}

function PayslipDocument({ line, company, payDate, periodLabel, payment }: PayslipDocProps) {
  const { calc, currency } = line;
  if (!calc) return null;

  const sym = currency === "USD" ? "$" : "L$";
  const fx  = line.exchangeRate;

  const buildNote = (mainNote: string, amount: number): string => {
    if (currency !== "USD") return mainNote;
    const lrd = (amount * fx).toLocaleString("en-LR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return mainNote + "\n" + "L$" + lrd + " equiv.";
  };

  const earningsRows = [
    {
      label:  "Regular Salary",
      note:   buildNote(`${line.regularHours} hrs x ${sym}${line.rate.toFixed(2)}/hr`, calc.regularSalary),
      amount: calc.regularSalary,
    },
    ...(line.overtimeHours > 0 ? [{
      label:  "Overtime Pay",
      note:   buildNote(`${line.overtimeHours} hrs x ${sym}${line.rate.toFixed(2)} x 1.5`, calc.overtimePay),
      amount: calc.overtimePay,
    }] : []),
    ...(line.holidayHours > 0 ? [{
      label:  "Holiday Pay",
      note:   buildNote(`${line.holidayHours} hrs x ${sym}${line.rate.toFixed(2)} x 2.0`, calc.holidayPay),
      amount: calc.holidayPay,
    }] : []),
    ...(calc.additionalEarnings > 0 ? [{
      label:  "Additional Earnings",
      note:   buildNote("Allowances / bonuses", calc.additionalEarnings),
      amount: calc.additionalEarnings,
    }] : []),
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

  const generated = new Date().toLocaleDateString("en-LR", {
    year: "numeric", month: "long", day: "numeric",
  });

  const netPayWords = numberToWords(calc.netPay);

  const methodLabel: Record<PaymentMethod, string> = {
    cash:          "Cash",
    bank_transfer: "Bank Transfer",
    orange_money:  "Orange Money",
    mtn_momo:      "Mobile Money (MTN)",
  };

  return (
    <Document
      title={`Payslip - ${line.fullName} - ${periodLabel ?? payDate}`}
      author="Slipdesk"
      subject="LRA-Compliant Payslip"
    >
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.address       && <Text style={styles.companyMeta}>{company.address}</Text>}
            {company.tin           && <Text style={styles.companyMeta}>LRA TIN: {company.tin}</Text>}
            {company.nasscorpRegNo && <Text style={styles.companyMeta}>NASSCORP Reg: {company.nasscorpRegNo}</Text>}
          </View>
          <View style={styles.payslipBadge}>
            <Text style={styles.payslipBadgeText}>PAYSLIP</Text>
          </View>
        </View>

        {/* Employee info */}
        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Employee</Text>
            <Text style={styles.infoValue}>{line.fullName}</Text>
            <Text style={styles.infoValueLight}>{line.jobTitle}</Text>
            <Text style={styles.infoValueLight}>{line.department}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Employee Number</Text>
            <Text style={styles.infoValue}>{line.employeeNumber}</Text>
            <Text style={[styles.infoLabel, { marginTop: 6 }]}>Pay Period</Text>
            <Text style={styles.infoValueLight}>{periodLabel ?? payDate}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Pay Date</Text>
            <Text style={styles.infoValue}>{fmtDate(payDate)}</Text>
            <Text style={[styles.infoLabel, { marginTop: 6 }]}>Currency</Text>
            <Text style={styles.infoValueLight}>{currency} (Rate: L${fx} per $1)</Text>
          </View>
        </View>

        {/* Earnings */}
        <Text style={styles.sectionTitle}>Earnings</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.thDesc}>Description</Text>
            <Text style={styles.thNotes}>Notes</Text>
            <Text style={styles.thAmount}>Amount ({currency})</Text>
          </View>
          {earningsRows.map((row, i) => (
            <View key={row.label} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={styles.tdDesc}>{row.label}</Text>
              <Text style={styles.tdNotes}>{row.note}</Text>
              <Text style={styles.tdAmount}>{fmt(row.amount, sym)}</Text>
            </View>
          ))}
          <View style={[styles.tableRow, { backgroundColor: "#f0fdf4" }]}>
            <Text style={styles.tdDesc}>GROSS PAY</Text>
            <Text style={styles.tdNotes}>{" "}</Text>
            <Text style={styles.tdAmountBold}>{fmt(calc.grossPay, sym)}</Text>
          </View>
        </View>

        {/* Deductions */}
        <Text style={styles.sectionTitle}>Deductions</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.thDesc}>Description</Text>
            <Text style={styles.thNotes}>Basis</Text>
            <Text style={styles.thAmount}>Amount ({currency})</Text>
          </View>
          {deductionRows.map((row, i) => (
            <View key={row.label} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={styles.tdDesc}>{row.label}</Text>
              <Text style={styles.tdNote}>{row.note}</Text>
              <Text style={styles.tdDeduction}>({fmt(row.amount, sym)})</Text>
            </View>
          ))}
          <View style={[styles.tableRow, { backgroundColor: "#fff7ed" }]}>
            <Text style={styles.tdDesc}>TOTAL DEDUCTIONS</Text>
            <Text style={styles.tdNotes}>{" "}</Text>
            <Text style={[styles.tdDeduction, { fontFamily: "Helvetica-Bold" }]}>
              ({fmt(calc.totalDeductions, sym)})
            </Text>
          </View>
        </View>

        {/* Employer contributions */}
        <View style={styles.erBox}>
          <Text style={styles.erBoxLabel}>
            Employer Contributions (Not deducted from employee)
          </Text>
          <View style={styles.erRow}>
            <Text style={styles.erText}>
              NASSCORP Employer Contribution (6% of {sym}{calc.nasscorp.base.toFixed(2)} regular salary)
            </Text>
            <Text style={styles.erAmount}>
              {fmt(calc.nasscorp.employerContribution, sym)}
            </Text>
          </View>
        </View>

        {/* Payment method – corrected */}
        {payment && methodLabel[payment.method] && (
          <View style={styles.paymentBox}>
            <Text style={styles.paymentBoxLabel}>Payment Method</Text>
            <View style={styles.paymentRow}>
              <View style={styles.paymentItem}>
                <Text style={styles.paymentItemLabel}>Method</Text>
                <Text style={styles.paymentItemValue}>{methodLabel[payment.method]}</Text>
              </View>

              {/* Bank: show Bank Name and Account Number */}
              {payment.method === "bank_transfer" && payment.bankName && (
                <View style={styles.paymentItem}>
                  <Text style={styles.paymentItemLabel}>Bank</Text>
                  <Text style={styles.paymentItemValue}>{payment.bankName}</Text>
                </View>
              )}
              {payment.method === "bank_transfer" && payment.accountNumber && (
                <View style={styles.paymentItem}>
                  <Text style={styles.paymentItemLabel}>Account Number</Text>
                  <Text style={styles.paymentItemValue}>{payment.accountNumber}</Text>
                </View>
              )}

              {/* Mobile money: show Mobile Number and Provider */}
              {(payment.method === "orange_money" || payment.method === "mtn_momo") && (
                <>
                  {payment.mobileNumber && (
                    <View style={styles.paymentItem}>
                      <Text style={styles.paymentItemLabel}>Mobile Number</Text>
                      <Text style={styles.paymentItemValue}>{payment.mobileNumber}</Text>
                    </View>
                  )}
                  <View style={styles.paymentItem}>
                    <Text style={styles.paymentItemLabel}>Provider</Text>
                    <Text style={styles.paymentItemValue}>
                      {payment.mobileProvider || (payment.method === "orange_money" ? "Orange Money" : "Lonestar MTN")}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* Net pay */}
        <View style={styles.netBox}>
          <Text style={styles.netLabel}>NET PAY</Text>
          <View style={styles.netRight}>
            <Text style={styles.netValue}>{fmt(calc.netPay, sym)}</Text>
          </View>
        </View>

        {/* Net pay in words */}
        <View style={styles.netWordsBox}>
          <Text style={styles.netWordsLabel}>In Words: </Text>
          <Text style={styles.netWordsText}>{netPayWords}</Text>
        </View>

        {/* Compliance */}
        <View style={styles.complianceRow}>
          <View style={styles.complianceBadge}>
            <View style={styles.complianceDot} />
            <Text style={styles.complianceText}>LRA Compliant</Text>
          </View>
          <View style={styles.complianceBadge}>
            <View style={styles.complianceDot} />
            <Text style={styles.complianceText}>NASSCORP Contributions Included</Text>
          </View>
          <View style={styles.complianceBadge}>
            <View style={styles.complianceDot} />
            <Text style={styles.complianceText}>{"Generated by Slipdesk - " + generated}</Text>
          </View>
        </View>

        {/* Signatures */}
        <View style={styles.signatureSection}>
          {["Authorised Signatory", "Date", "Employee Acknowledgement"].map((label) => (
            <View key={label} style={styles.signatureBox}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            This payslip is computer-generated and is valid without a physical signature.
          </Text>
          <Text style={styles.footerBrand}>Slipdesk - slipdesk.com</Text>
        </View>

      </Page>
    </Document>
  );
}

// ─── Download helpers ─────────────────────────────────────────────────────────

export async function downloadPayslip(
  line: PayRunLine,
  company: CompanyInfo,
  payDate: string,
  periodLabel?: string,
  payment?: PaymentDetails,
): Promise<void> {
  const doc = (
    <PayslipDocument
      line={line}
      company={company}
      payDate={payDate}
      periodLabel={periodLabel}
      payment={payment}
    />
  );
  const blob = await pdf(doc).toBlob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `Payslip_${line.employeeNumber}_${periodLabel ?? payDate}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAllPayslips(
  lines: PayRunLine[],
  company: CompanyInfo,
  payDate: string,
  periodLabel?: string,
  onProgress?: (current: number, total: number) => void,
  getPayment?: (line: PayRunLine) => PaymentDetails | undefined,
): Promise<void> {
  for (let i = 0; i < lines.length; i++) {
    onProgress?.(i + 1, lines.length);
    await downloadPayslip(lines[i], company, payDate, periodLabel, getPayment?.(lines[i]));
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ─── Button components ────────────────────────────────────────────────────────

export function PayslipButton({
  line,
  company,
  payDate,
  periodLabel,
  payment,
  variant = "icon",
}: {
  line:          PayRunLine;
  company:       CompanyInfo;
  payDate:       string;
  periodLabel?:  string;
  payment?:      PaymentDetails;
  variant?:      "icon" | "full";
}) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    if (!line.calc) return;
    setLoading(true);
    try {
      await downloadPayslip(line, company, payDate, periodLabel, payment);
    } finally {
      setLoading(false);
    }
  }

  if (variant === "full") {
    return (
      <button
        onClick={handle}
        disabled={loading || !line.calc}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                   bg-[#002147] text-white hover:bg-[#002147]/80 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {loading ? "Generating..." : "Download Payslip"}
      </button>
    );
  }

  return (
    <button
      onClick={handle}
      disabled={loading || !line.calc}
      className="text-slate-400 hover:text-[#002147] transition-colors p-1
                 rounded-lg hover:bg-slate-100 disabled:opacity-40"
      title="Download payslip PDF"
    >
      {loading ? <Loader className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
    </button>
  );
}

export function BulkDownloadButton({
  lines,
  company,
  payDate,
  periodLabel,
  getPayment,
}: {
  lines:         PayRunLine[];
  company:       CompanyInfo;
  payDate:       string;
  periodLabel?:  string;
  getPayment?:   (line: PayRunLine) => PaymentDetails | undefined;
}) {
  const [loading,  setLoading]  = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  async function handleAll() {
    setLoading(true);
    try {
      await downloadAllPayslips(
        lines, company, payDate, periodLabel,
        (c, t) => setProgress({ current: c, total: t }),
        getPayment,
      );
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  return (
    <button
      onClick={handleAll}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                 bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] transition-colors
                 disabled:opacity-60"
    >
      {loading ? (
        <>
          <Loader className="w-4 h-4 animate-spin" />
          {progress.total > 0
            ? `${progress.current}/${progress.total} payslips...`
            : "Generating..."}
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          Download All Payslips ({lines.length})
        </>
      )}
    </button>
  );
}

export default PayslipDocument;