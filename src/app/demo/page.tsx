"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight, FileText, Users, DollarSign,
  ChevronDown, ChevronUp, Download, Loader,
  CheckCircle2, Shield, Zap,
} from "lucide-react";

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_EMPLOYEES = [
  { id: "1", name: "Mary Johnson",   title: "Senior Accountant",  dept: "Finance",     currency: "USD", rate: 7.50,  hours: 173.33, allowances: 100 },
  { id: "2", name: "James Kollie",   title: "Sales Manager",      dept: "Sales",       currency: "USD", rate: 10.00, hours: 173.33, allowances: 150 },
  { id: "3", name: "Fatu Kamara",    title: "HR Officer",         dept: "HR",          currency: "LRD", rate: 800,   hours: 173.33, allowances: 30000 },
  { id: "4", name: "Joseph Harris",  title: "Software Developer", dept: "Engineering", currency: "USD", rate: 13.00, hours: 173.33, allowances: 200 },
  { id: "5", name: "Edith Blamo",    title: "Admin Assistant",    dept: "Admin",       currency: "USD", rate: 5.50,  hours: 173.33, allowances: 50  },
];

const EXCHANGE_RATE = 185.44;

// ─── LRA Tax + NASSCORP engine (mirrors your real engine) ─────────────────────

function calcLRATax(grossUSD: number): number {
  const grossLRD = grossUSD * EXCHANGE_RATE;
  let taxLRD = 0;
  if (grossLRD <= 70000) taxLRD = 0;
  else if (grossLRD <= 200000) taxLRD = (grossLRD - 70000) * 0.05;
  else if (grossLRD <= 800000) taxLRD = 6500 + (grossLRD - 200000) * 0.15;
  else taxLRD = 96500 + (grossLRD - 800000) * 0.25;
  return taxLRD / EXCHANGE_RATE;
}

function calcEmployee(emp: typeof DEMO_EMPLOYEES[0], companyName: string) {
  const baseSalary = emp.rate * emp.hours;
  const grossPay   = baseSalary + emp.allowances;
  const nasscorpEE = baseSalary * 0.04;
  const nasscorpER = baseSalary * 0.06;
  const incomeTax  = emp.currency === "USD"
    ? calcLRATax(baseSalary)
    : calcLRATax(baseSalary / EXCHANGE_RATE) * EXCHANGE_RATE;
  const netPay     = grossPay - nasscorpEE - incomeTax;
  const sym        = emp.currency === "USD" ? "$" : "L$";
  const effectiveRate = incomeTax / grossPay;
  return { baseSalary, grossPay, nasscorpEE, nasscorpER, incomeTax, netPay, sym, effectiveRate };
}

// ─── Number to words ──────────────────────────────────────────────────────────

function numberToWords(n: number): string {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function tw(n: number): string {
    if (n === 0) return "";
    if (n < 20)  return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " " + ones[n%10] : "");
    return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " " + tw(n%100) : "");
  }
  const d = Math.floor(n), c = Math.round((n - d) * 100);
  let r = d >= 1000 ? tw(Math.floor(d/1000)) + " Thousand" + (d%1000 ? " " + tw(d%1000) : "") : tw(d);
  r = (r || "Zero") + " Dollar" + (d !== 1 ? "s" : "");
  if (c > 0) r += " and " + tw(c) + " Cent" + (c !== 1 ? "s" : "");
  return r;
}

const fmt = (n: number, sym: string) =>
  `${sym}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── PDF Generator ────────────────────────────────────────────────────────────

async function generateDemoPayslip(
  emp: typeof DEMO_EMPLOYEES[0],
  calc: ReturnType<typeof calcEmployee>,
  companyName: string,
  periodLabel: string,
) {
  const { Document, Page, Text, View, StyleSheet, pdf } = await import("@react-pdf/renderer");
  const NAVY = "#002147", EMERALD = "#50C878", SLATE = "#64748b";
  const S = StyleSheet.create({
    page: { fontFamily: "Helvetica", fontSize: 9, color: "#1e293b", backgroundColor: "#fff", paddingHorizontal: 36, paddingVertical: 32 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: NAVY },
    coName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 3 },
    coMeta: { fontSize: 8, color: SLATE, lineHeight: 1.5 },
    badge: { backgroundColor: NAVY, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 },
    badgeText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fff", letterSpacing: 1 },
    infoGrid: { flexDirection: "row", gap: 12, marginBottom: 18 },
    infoBox: { flex: 1, backgroundColor: "#f8fafc", borderRadius: 6, padding: 10, borderWidth: 1, borderColor: "#e2e8f0" },
    infoLbl: { fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
    infoVal: { fontSize: 9, color: NAVY, fontFamily: "Helvetica-Bold" },
    infoSub: { fontSize: 8, color: "#374151" },
    secTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, marginTop: 14 },
    table: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, overflow: "hidden" },
    tHead: { flexDirection: "row", backgroundColor: NAVY, paddingHorizontal: 10, paddingVertical: 6 },
    thDesc: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", width: 160 },
    thNotes: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", flex: 1 },
    thAmt: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", textAlign: "right", width: 90 },
    tRow: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
    tAlt: { backgroundColor: "#f8fafc" },
    tdDesc: { width: 160, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY },
    tdNotes: { flex: 1, fontSize: 8, color: "#374151" },
    tdAmt: { width: 90, fontSize: 8.5, color: "#374151", textAlign: "right" },
    tdAmtBold: { width: 90, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY, textAlign: "right" },
    tdRed: { width: 90, fontSize: 8.5, color: "#dc2626", textAlign: "right" },
    netBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: NAVY, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12 },
    netLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fff" },
    netValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: EMERALD },
    netWords: { backgroundColor: "#f8fafc", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, marginTop: 6, borderWidth: 1, borderColor: "#e2e8f0", flexDirection: "row", gap: 6 },
    netWordsLbl: { fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase" },
    netWordsTxt: { fontSize: 8, color: NAVY, fontFamily: "Helvetica-Bold", flex: 1 },
    compRow: { flexDirection: "row", gap: 8, marginTop: 10 },
    compBadge: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#86efac", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5 },
    compDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: EMERALD },
    compText: { fontSize: 7.5, color: "#166534", fontFamily: "Helvetica-Bold" },
    demoWatermark: { position: "absolute", top: "45%", left: "10%", fontSize: 60, fontFamily: "Helvetica-Bold", color: "#00000008", transform: "rotate(-35deg)" },
    footer: { marginTop: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e2e8f0", flexDirection: "row", justifyContent: "space-between" },
    footerTxt: { fontSize: 7, color: "#94a3b8" },
    footerBrand: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: NAVY },
  });

  const grossLRD = (emp.currency === "USD" ? calc.grossPay : calc.grossPay / EXCHANGE_RATE) * EXCHANGE_RATE;
  const netUSD   = emp.currency === "USD" ? calc.netPay : calc.netPay / EXCHANGE_RATE;

  const doc = (
    <Document title={`Demo Payslip - ${emp.name}`} author="Slipdesk">
      <Page size="A4" style={S.page}>
        <Text style={S.demoWatermark}>DEMO</Text>
        <View style={S.header}>
          <View>
            <Text style={S.coName}>{companyName || "Your Company Name"}</Text>
            <Text style={S.coMeta}>Monrovia, Liberia</Text>
            <Text style={S.coMeta}>Generated by Slipdesk — slipdesk.com</Text>
          </View>
          <View style={S.badge}><Text style={S.badgeText}>PAYSLIP</Text></View>
        </View>

        <View style={S.infoGrid}>
          <View style={S.infoBox}>
            <Text style={S.infoLbl}>Employee</Text>
            <Text style={S.infoVal}>{emp.name}</Text>
            <Text style={S.infoSub}>{emp.title}</Text>
            <Text style={S.infoSub}>{emp.dept}</Text>
          </View>
          <View style={S.infoBox}>
            <Text style={S.infoLbl}>Pay Period</Text>
            <Text style={S.infoVal}>{periodLabel}</Text>
            <Text style={[S.infoLbl, { marginTop: 6 }]}>Employee No.</Text>
            <Text style={S.infoSub}>EMP-00{emp.id}</Text>
          </View>
          <View style={S.infoBox}>
            <Text style={S.infoLbl}>Currency</Text>
            <Text style={S.infoVal}>{emp.currency}</Text>
            <Text style={[S.infoLbl, { marginTop: 6 }]}>Exchange Rate</Text>
            <Text style={S.infoSub}>L${EXCHANGE_RATE} / $1</Text>
          </View>
        </View>

        <Text style={S.secTitle}>Earnings</Text>
        <View style={S.table}>
          <View style={S.tHead}>
            <Text style={S.thDesc}>Description</Text>
            <Text style={S.thNotes}>Notes</Text>
            <Text style={S.thAmt}>Amount ({emp.currency})</Text>
          </View>
          <View style={S.tRow}>
            <Text style={S.tdDesc}>Regular Salary</Text>
            <Text style={S.tdNotes}>{emp.hours} hrs × {calc.sym}{emp.rate.toFixed(2)}/hr</Text>
            <Text style={S.tdAmt}>{fmt(calc.baseSalary, calc.sym)}</Text>
          </View>
          {emp.allowances > 0 && (
            <View style={[S.tRow, S.tAlt]}>
              <Text style={S.tdDesc}>Allowances</Text>
              <Text style={S.tdNotes}>Monthly allowance</Text>
              <Text style={S.tdAmt}>{fmt(emp.allowances, calc.sym)}</Text>
            </View>
          )}
          <View style={[S.tRow, { backgroundColor: "#f0fdf4" }]}>
            <Text style={S.tdDesc}>GROSS PAY</Text>
            <Text style={S.tdNotes}> </Text>
            <Text style={S.tdAmtBold}>{fmt(calc.grossPay, calc.sym)}</Text>
          </View>
        </View>

        <Text style={S.secTitle}>Deductions</Text>
        <View style={S.table}>
          <View style={S.tHead}>
            <Text style={S.thDesc}>Description</Text>
            <Text style={S.thNotes}>Basis</Text>
            <Text style={S.thAmt}>Amount ({emp.currency})</Text>
          </View>
          <View style={S.tRow}>
            <Text style={S.tdDesc}>NASSCORP (EE 4%)</Text>
            <Text style={S.tdNotes}>4% of {fmt(calc.baseSalary, calc.sym)} base salary</Text>
            <Text style={S.tdRed}>({fmt(calc.nasscorpEE, calc.sym)})</Text>
          </View>
          <View style={[S.tRow, S.tAlt]}>
            <Text style={S.tdDesc}>Income Tax (LRA)</Text>
            <Text style={S.tdNotes}>Effective rate: {(calc.effectiveRate * 100).toFixed(1)}% · L${(grossLRD).toLocaleString("en-US", { maximumFractionDigits: 0 })} gross</Text>
            <Text style={S.tdRed}>({fmt(calc.incomeTax, calc.sym)})</Text>
          </View>
          <View style={[S.tRow, { backgroundColor: "#fff7ed" }]}>
            <Text style={S.tdDesc}>TOTAL DEDUCTIONS</Text>
            <Text style={S.tdNotes}> </Text>
            <Text style={[S.tdRed, { fontFamily: "Helvetica-Bold" }]}>({fmt(calc.nasscorpEE + calc.incomeTax, calc.sym)})</Text>
          </View>
        </View>

        <View style={{ marginTop: 10, backgroundColor: "#f8fafc", borderRadius: 6, padding: 8, borderWidth: 1, borderColor: "#e2e8f0" }}>
          <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", marginBottom: 4 }}>Employer Contributions (not deducted from employee)</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 7.5, color: SLATE }}>NASSCORP Employer Contribution (6% of base salary)</Text>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: NAVY }}>{fmt(calc.nasscorpER, calc.sym)}</Text>
          </View>
        </View>

        <View style={S.netBox}>
          <Text style={S.netLabel}>NET PAY</Text>
          <Text style={S.netValue}>{fmt(calc.netPay, calc.sym)}</Text>
        </View>
        <View style={S.netWords}>
          <Text style={S.netWordsLbl}>In Words: </Text>
          <Text style={S.netWordsTxt}>{numberToWords(netUSD)}</Text>
        </View>

        <View style={S.compRow}>
          <View style={S.compBadge}><View style={S.compDot}/><Text style={S.compText}>LRA Income Tax Compliant</Text></View>
          <View style={S.compBadge}><View style={S.compDot}/><Text style={S.compText}>NASSCORP Verified</Text></View>
          <View style={S.compBadge}><View style={S.compDot}/><Text style={S.compText}>Generated by Slipdesk</Text></View>
        </View>

        <View style={S.footer}>
          <Text style={S.footerTxt}>DEMO PAYSLIP — Data is illustrative only. Sign up at slipdesk.com for real payroll.</Text>
          <Text style={S.footerBrand}>Slipdesk · slipdesk.com</Text>
        </View>
      </Page>
    </Document>
  );

  return await pdf(doc).toBlob();
}

// ─── Main demo page ───────────────────────────────────────────────────────────

export default function DemoPage() {
  const [companyName,  setCompanyName]  = useState("");
  const [activeTab,    setActiveTab]    = useState<"payroll" | "employees">("payroll");
  const [expandedEmp,  setExpandedEmp]  = useState<string | null>(null);
  const [downloading,  setDownloading]  = useState<string | null>(null);
  const [downloadedAll, setDownloadedAll] = useState(false);
  const [loadingAll,   setLoadingAll]   = useState(false);

  const period = "June 2025";
  const displayName = companyName || "Demo Company Ltd";

  const calcs = DEMO_EMPLOYEES.map(emp => ({
    emp,
    calc: calcEmployee(emp, displayName),
  }));

  const totals = calcs.reduce((acc, { emp, calc }) => {
    const toUSD = (n: number) => emp.currency === "USD" ? n : n / EXCHANGE_RATE;
    return {
      gross:    acc.gross    + toUSD(calc.grossPay),
      net:      acc.net      + toUSD(calc.netPay),
      tax:      acc.tax      + toUSD(calc.incomeTax),
      nasscorp: acc.nasscorp + toUSD(calc.nasscorpEE),
    };
  }, { gross: 0, net: 0, tax: 0, nasscorp: 0 });

  async function handleDownload(empId: string) {
    const item = calcs.find(c => c.emp.id === empId);
    if (!item) return;
    setDownloading(empId);
    try {
      const blob = await generateDemoPayslip(item.emp, item.calc, displayName, period);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `Demo_Payslip_${item.emp.name.replace(/\s/g, "_")}_${period}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadAll() {
    setLoadingAll(true);
    for (const { emp, calc } of calcs) {
      const blob = await generateDemoPayslip(emp, calc, displayName, period);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `Demo_Payslip_${emp.name.replace(/\s/g, "_")}_${period}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      await new Promise(r => setTimeout(r, 400));
    }
    setLoadingAll(false);
    setDownloadedAll(true);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin   { to   { transform: rotate(360deg) } }
      `}</style>

      {/* ── Demo banner ─────────────────────────────────────────────────────── */}
      <div style={{
        background: "#002147", padding: "10px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: "#50C878", color: "#002147",
            fontSize: 10, fontWeight: 800, padding: "2px 8px",
            borderRadius: 6, letterSpacing: "0.06em",
          }}>DEMO</span>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
            Interactive preview — no account needed. Data is not saved.
          </span>
        </div>
        <Link href="/signup" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "#50C878", color: "#002147",
          padding: "7px 18px", borderRadius: 8,
          fontWeight: 700, fontSize: 13, textDecoration: "none",
        }}>
          Start free account <ArrowRight size={13} />
        </Link>
      </div>

      {/* ── Company name personalisation ────────────────────────────────────── */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #E2E8F0",
        padding: "16px 24px", display: "flex",
        alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 260 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "#002147", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ color: "#50C878", fontSize: 14, fontWeight: 800 }}>
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 11, color: "#94A3B8", fontFamily: "'DM Mono',monospace" }}>
              PREVIEWING AS
            </p>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Enter your company name…"
              style={{
                border: "none", outline: "none", fontSize: 15,
                fontWeight: 700, color: "#002147", background: "transparent",
                width: "100%", fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#94A3B8" }}>
          Your name appears on all payslips below in real time.
        </p>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 20px" }}>

        {/* ── Summary cards ───────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Total Gross",    value: `$${totals.gross.toFixed(2)}`,    icon: <DollarSign size={16} />, color: "#3B82F6" },
            { label: "Total Net Pay",  value: `$${totals.net.toFixed(2)}`,      icon: <CheckCircle2 size={16} />, color: "#50C878" },
            { label: "Income Tax",     value: `$${totals.tax.toFixed(2)}`,      icon: <FileText size={16} />,    color: "#F59E0B" },
            { label: "Employees",      value: String(DEMO_EMPLOYEES.length),   icon: <Users size={16} />,       color: "#8B5CF6" },
          ].map(card => (
            <div key={card.label} style={{
              background: "#fff", borderRadius: 16,
              padding: "18px 20px", border: "1px solid #E2E8F0",
              animation: "fadeUp 0.4s ease both",
            }}>
              <div style={{ color: card.color, marginBottom: 10 }}>{card.icon}</div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: "#0F172A" }}>
                {card.value}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {card.label}
              </p>
            </div>
          ))}
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[
            { id: "payroll",   label: "Payroll Run" },
            { id: "employees", label: "Employees"   },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              style={{
                padding: "9px 20px", borderRadius: 10,
                cursor: "pointer", fontSize: 13, fontWeight: 700,
                background: activeTab === tab.id ? "#002147" : "#fff",
                color:      activeTab === tab.id ? "#50C878"  : "#64748B",
                border:     activeTab === tab.id ? "none" : "1px solid #E2E8F0",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Payroll tab ──────────────────────────────────────────────────── */}
        {activeTab === "payroll" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E2E8F0", overflow: "hidden" }}>
              <div style={{
                padding: "16px 24px", background: "#F8FAFC",
                borderBottom: "1px solid #E2E8F0",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
                    {displayName} — {period}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94A3B8" }}>
                    LRA tax & NASSCORP calculated automatically · Click any row to expand
                  </p>
                </div>
                <button
                  onClick={handleDownloadAll}
                  disabled={loadingAll}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "9px 18px", borderRadius: 10,
                    background: "#50C878", color: "#002147",
                    fontWeight: 700, fontSize: 13, border: "none",
                    cursor: "pointer", whiteSpace: "nowrap",
                    opacity: loadingAll ? 0.7 : 1,
                  }}
                >
                  {loadingAll
                    ? <><Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> Generating…</>
                    : <><Download size={13} /> All Payslips ({DEMO_EMPLOYEES.length})</>}
                </button>
              </div>

              {downloadedAll && (
                <div style={{
                  padding: "12px 24px", background: "#F0FDF4",
                  borderBottom: "1px solid #BBF7D0",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <CheckCircle2 size={16} color="#16A34A" />
                  <p style={{ margin: 0, fontSize: 13, color: "#15803D", fontWeight: 600 }}>
                    {DEMO_EMPLOYEES.length} payslips downloaded! This is exactly what your employees receive each month.
                    <Link href="/signup" style={{ color: "#002147", fontWeight: 700, marginLeft: 8, textDecoration: "underline" }}>
                      Start your free account →
                    </Link>
                  </p>
                </div>
              )}

              {calcs.map(({ emp, calc }, idx) => {
                const isExpanded = expandedEmp === emp.id;
                return (
                  <div key={emp.id} style={{ borderBottom: idx < calcs.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                    {/* Row */}
                    <div
                      onClick={() => setExpandedEmp(isExpanded ? null : emp.id)}
                      style={{
                        display: "flex", alignItems: "center", padding: "16px 24px",
                        cursor: "pointer", gap: 16, flexWrap: "wrap",
                        background: isExpanded ? "#F0FDF4" : "transparent",
                        transition: "background 0.15s",
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%",
                        background: "#002147", color: "#50C878",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 800, flexShrink: 0,
                        fontFamily: "'DM Mono',monospace",
                      }}>
                        {emp.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                      </div>

                      {/* Name + title */}
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{emp.name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#94A3B8" }}>{emp.title} · {emp.dept}</p>
                      </div>

                      {/* Currency badge */}
                      <span style={{
                        background: emp.currency === "USD" ? "#EFF6FF" : "#FEF3C7",
                        color:      emp.currency === "USD" ? "#1D4ED8" : "#92400E",
                        fontSize: 10, fontWeight: 700, padding: "2px 8px",
                        borderRadius: 20, fontFamily: "'DM Mono',monospace",
                      }}>
                        {emp.currency}
                      </span>

                      {/* Numbers */}
                      <div style={{ textAlign: "right", minWidth: 90 }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#94A3B8" }}>Gross</p>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
                          {fmt(calc.grossPay, calc.sym)}
                        </p>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 90 }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#94A3B8" }}>Tax</p>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#EF4444", fontFamily: "'DM Mono',monospace" }}>
                          {fmt(calc.incomeTax, calc.sym)}
                        </p>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 90 }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#94A3B8" }}>Net Pay</p>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#50C878", fontFamily: "'DM Mono',monospace" }}>
                          {fmt(calc.netPay, calc.sym)}
                        </p>
                      </div>

                      {/* Expand + download */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          onClick={e => { e.stopPropagation(); handleDownload(emp.id); }}
                          disabled={downloading === emp.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "6px 12px", borderRadius: 8,
                            background: "#F0FDF4", color: "#15803D",
                            border: "1px solid #BBF7D0",
                            fontSize: 12, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          {downloading === emp.id
                            ? <Loader size={12} style={{ animation: "spin 1s linear infinite" }} />
                            : <FileText size={12} />}
                          PDF
                        </button>
                        {isExpanded
                          ? <ChevronUp size={16} color="#94A3B8" />
                          : <ChevronDown size={16} color="#94A3B8" />}
                      </div>
                    </div>

                    {/* Expanded breakdown */}
                    {isExpanded && (
                      <div style={{
                        padding: "0 24px 20px", background: "#F8FAFC",
                        borderTop: "1px solid #E2E8F0",
                        animation: "fadeUp 0.2s ease",
                      }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, paddingTop: 16 }}>
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                              Earnings
                            </p>
                            {[
                              { label: "Regular Salary", value: fmt(calc.baseSalary, calc.sym) },
                              { label: "Allowances",     value: fmt(emp.allowances,  calc.sym) },
                              { label: "Gross Pay",      value: fmt(calc.grossPay,   calc.sym), bold: true },
                            ].map(row => (
                              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F1F5F9" }}>
                                <span style={{ fontSize: 13, color: "#475569" }}>{row.label}</span>
                                <span style={{ fontSize: 13, fontWeight: row.bold ? 800 : 600, fontFamily: "'DM Mono',monospace", color: row.bold ? "#0F172A" : "#475569" }}>
                                  {row.value}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                              Deductions
                            </p>
                            {[
                              { label: `NASSCORP EE (4%)`, value: fmt(calc.nasscorpEE,  calc.sym), red: true  },
                              { label: `Income Tax (LRA)`, value: fmt(calc.incomeTax,   calc.sym), red: true  },
                              { label: `NASSCORP ER (6%)`, value: fmt(calc.nasscorpER,  calc.sym), note: "Employer pays this, not employee" },
                              { label: `Net Pay`,          value: fmt(calc.netPay,      calc.sym), bold: true, green: true },
                            ].map(row => (
                              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "5px 0", borderBottom: "1px solid #F1F5F9" }}>
                                <div>
                                  <span style={{ fontSize: 13, color: "#475569" }}>{row.label}</span>
                                  {row.note && <p style={{ margin: 0, fontSize: 10, color: "#94A3B8" }}>{row.note}</p>}
                                </div>
                                <span style={{
                                  fontSize: 13, fontFamily: "'DM Mono',monospace",
                                  fontWeight: row.bold ? 800 : 600,
                                  color: row.green ? "#16A34A" : row.red ? "#EF4444" : "#475569",
                                }}>
                                  {row.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{ marginTop: 14, padding: "10px 14px", background: "#F0FDF4", borderRadius: 10, border: "1px solid #BBF7D0" }}>
                          <p style={{ margin: 0, fontSize: 12, color: "#166534" }}>
                            <strong>In words:</strong> {numberToWords(emp.currency === "USD" ? calc.netPay : calc.netPay / EXCHANGE_RATE)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Totals row */}
              <div style={{
                padding: "16px 24px", background: "#002147",
                display: "flex", justifyContent: "flex-end", gap: 32, flexWrap: "wrap",
              }}>
                {[
                  { label: "Total Gross",    value: `$${totals.gross.toFixed(2)}`,    color: "#fff"     },
                  { label: "Total Tax",      value: `$${totals.tax.toFixed(2)}`,      color: "#FCA5A5"  },
                  { label: "Total NASSCORP", value: `$${totals.nasscorp.toFixed(2)}`, color: "#FCD34D"  },
                  { label: "Total Net Pay",  value: `$${totals.net.toFixed(2)}`,      color: "#50C878"  },
                ].map(t => (
                  <div key={t.label} style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Mono',monospace" }}>{t.label}</p>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.color, fontFamily: "'DM Mono',monospace" }}>{t.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Employees tab ────────────────────────────────────────────────── */}
        {activeTab === "employees" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E2E8F0", overflow: "hidden" }}>
              <div style={{ padding: "16px 24px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
                  Employee Directory
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94A3B8" }}>
                  USD & LRD employees in the same payroll run
                </p>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                    {["Employee", "Department", "Currency", "Rate/hr", "Std Hours", "Monthly Gross"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_EMPLOYEES.map((emp, i) => {
                    const calc = calcEmployee(emp, displayName);
                    return (
                      <tr key={emp.id} style={{ borderBottom: i < DEMO_EMPLOYEES.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#002147", color: "#50C878", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                              {emp.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                            </div>
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{emp.name}</p>
                              <p style={{ margin: 0, fontSize: 11, color: "#94A3B8" }}>{emp.title}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: 13, color: "#475569" }}>{emp.dept}</td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ background: emp.currency === "USD" ? "#EFF6FF" : "#FEF3C7", color: emp.currency === "USD" ? "#1D4ED8" : "#92400E", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                            {emp.currency}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: 13, fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>
                          {calc.sym}{emp.rate.toFixed(2)}
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: 13, color: "#475569", fontFamily: "'DM Mono',monospace" }}>
                          {emp.hours}
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: 14, fontFamily: "'DM Mono',monospace", fontWeight: 700, color: "#0F172A" }}>
                          {fmt(calc.grossPay, calc.sym)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CTA strip ────────────────────────────────────────────────────── */}
        <div style={{
          marginTop: 36, background: "#002147", borderRadius: 20,
          padding: "28px 32px", display: "flex",
          alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 20,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#fff" }}>
              Ready to run real payroll for {displayName}?
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              30-day free trial · No credit card · Your data, your control.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/signup" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#50C878", color: "#002147",
              padding: "13px 28px", borderRadius: 12,
              fontWeight: 800, fontSize: 14, textDecoration: "none",
            }}>
              Get started free <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* ── Trust badges ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 28, flexWrap: "wrap" }}>
          {[
            { icon: <Shield size={14} />,       text: "LRA Compliant"         },
            { icon: <CheckCircle2 size={14} />, text: "NASSCORP Verified"     },
            { icon: <Zap size={14} />,          text: "Real-time calculation" },
            { icon: <FileText size={14} />,     text: "PDF payslips included" },
          ].map(badge => (
            <div key={badge.text} style={{ display: "flex", alignItems: "center", gap: 6, color: "#94A3B8", fontSize: 12 }}>
              {badge.icon} {badge.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}