"use client";

/**
 * Slipdesk — Generic tabular report PDF.
 * Used by the Reporting Center and Compliance Center to export any tabular
 * report (payroll register, tax summary, NASSCORP summary, etc.) as a branded
 * PDF that matches the payslip visual identity.
 */

import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";

const NAVY = "#002147";
const EMERALD = "#50C878";
const SLATE = "#64748b";
const LIGHT = "#f8fafc";
const BORDER = "#e2e8f0";

export interface ReportColumn {
  header: string;
  /** Relative flex width. */
  width?: number;
  align?: "left" | "right" | "center";
}

export interface ReportSection {
  heading?: string;
  columns: ReportColumn[];
  rows: (string | number)[][];
  /** Optional highlighted total row rendered at the bottom. */
  totalRow?: (string | number)[];
}

export interface ReportMeta {
  label: string;
  value: string;
}

export interface ReportDocProps {
  title: string;
  subtitle?: string;
  companyName: string;
  meta?: ReportMeta[];
  sections: ReportSection[];
}

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8.5, color: "#1e293b", paddingHorizontal: 32, paddingVertical: 30 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 16, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: NAVY,
  },
  companyName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 2 },
  reportTitle: { fontSize: 10, color: SLATE },
  badge: { backgroundColor: NAVY, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4 },
  badgeText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#fff", letterSpacing: 1 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  metaBox: {
    backgroundColor: LIGHT, borderRadius: 5, padding: 8, borderWidth: 1, borderColor: BORDER, minWidth: 110,
  },
  metaLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: NAVY },
  sectionHeading: { fontSize: 8, fontFamily: "Helvetica-Bold", color: SLATE, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 12, marginBottom: 5 },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 5, overflow: "hidden" },
  tableHeader: { flexDirection: "row", backgroundColor: NAVY, paddingHorizontal: 8, paddingVertical: 5 },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#fff" },
  row: { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: BORDER },
  rowAlt: { backgroundColor: LIGHT },
  td: { fontSize: 7.5, color: "#374151" },
  totalRow: { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#f0fdf4", borderTopWidth: 1, borderTopColor: EMERALD },
  totalTd: { fontSize: 8, fontFamily: "Helvetica-Bold", color: NAVY },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8 },
  footerText: { fontSize: 7, color: "#94a3b8" },
  footerBrand: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: NAVY },
});

function cellStyle(col: ReportColumn, base: object) {
  return { ...base, flex: col.width ?? 1, textAlign: col.align ?? "left" } as const;
}

function ReportDocument({ title, subtitle, companyName, meta, sections }: ReportDocProps) {
  const generated = new Date().toLocaleDateString("en-LR", { year: "numeric", month: "long", day: "numeric" });
  return (
    <Document title={title} author="Slipdesk" subject={title}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{companyName || "Slipdesk"}</Text>
            <Text style={styles.reportTitle}>{title}</Text>
            {subtitle ? <Text style={[styles.reportTitle, { fontSize: 8 }]}>{subtitle}</Text> : null}
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>REPORT</Text>
          </View>
        </View>

        {meta && meta.length > 0 && (
          <View style={styles.metaGrid}>
            {meta.map((m) => (
              <View key={m.label} style={styles.metaBox}>
                <Text style={styles.metaLabel}>{m.label}</Text>
                <Text style={styles.metaValue}>{m.value}</Text>
              </View>
            ))}
          </View>
        )}

        {sections.map((section, si) => (
          <View key={si}>
            {section.heading ? <Text style={styles.sectionHeading}>{section.heading}</Text> : null}
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                {section.columns.map((c, ci) => (
                  <Text key={ci} style={cellStyle(c, styles.th)}>{c.header}</Text>
                ))}
              </View>
              {section.rows.map((r, ri) => (
                <View key={ri} style={[styles.row, ri % 2 === 1 ? styles.rowAlt : {}]}>
                  {section.columns.map((c, ci) => (
                    <Text key={ci} style={cellStyle(c, styles.td)}>{String(r[ci] ?? "")}</Text>
                  ))}
                </View>
              ))}
              {section.totalRow && (
                <View style={styles.totalRow}>
                  {section.columns.map((c, ci) => (
                    <Text key={ci} style={cellStyle(c, styles.totalTd)}>{String(section.totalRow?.[ci] ?? "")}</Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated by Slipdesk · {generated}</Text>
          <Text style={styles.footerBrand}>Slipdesk · Payroll & Compliance</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function downloadReportPdf(props: ReportDocProps, filename: string): Promise<void> {
  const blob = await pdf(<ReportDocument {...props} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export default ReportDocument;
