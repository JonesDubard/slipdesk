import * as XLSX from "xlsx";
import { parseCSVLine, splitCsvLines } from "@/lib/csv/parse-csv-line";
import { canonicalHeader, isLikelyHeaderRow } from "@/lib/csv/normalize-headers";

export const SPREADSHEET_ACCEPT = ".csv,.tsv,.txt,.xlsx,.xls";

export function isSpreadsheetFilename(name: string): boolean {
  return /\.(csv|tsv|txt|xlsx|xls|xlsm)$/i.test(name);
}

export interface SpreadsheetTable {
  headers: string[];
  rows: string[][];
  error?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function cellToString(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return String(value).trim();
}

export function decodeSpreadsheetBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 64));
  let nuls = 0;
  for (let i = 0; i < sample.length; i++) if (sample[i] === 0) nuls++;
  if (nuls >= 8) return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function countUnquoted(line: string, delimiter: string): number {
  let n = 0;
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === delimiter) n++;
  }
  return n;
}

export function detectDelimiter(line: string): string {
  const comma = countUnquoted(line, ",");
  const semi = countUnquoted(line, ";");
  const tab = countUnquoted(line, "\t");
  if (tab > comma && tab >= semi) return "\t";
  if (semi > comma) return ";";
  return ",";
}

function looksLikeXlsx(buffer: ArrayBuffer, filename?: string): boolean {
  const name = (filename ?? "").toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm")) return true;
  const b = new Uint8Array(buffer);
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

function canonicalizeHeaders(cells: string[]): string[] {
  return cells.map(canonicalHeader);
}

function tableFromAoa(aoa: unknown[][]): SpreadsheetTable {
  const lines = aoa
    .map((row) => (Array.isArray(row) ? row.map(cellToString) : []))
    .filter((row) => row.some((c) => c.trim() !== ""));
  if (lines.length === 0) {
    return { headers: [], rows: [], error: "Spreadsheet is empty." };
  }
  const headerIdx = lines.findIndex(isLikelyHeaderRow);
  if (headerIdx < 0) {
    return {
      headers: [],
      rows: [],
      error: "Could not find a header row. Use columns such as employee_number, first_name, last_name, and rate.",
    };
  }
  const headers = canonicalizeHeaders(lines[headerIdx]);
  const rows = lines.slice(headerIdx + 1).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) {
    return { headers, rows: [], error: "CSV must have a header row and at least one data row." };
  }
  return { headers, rows };
}

export function parseTextTable(text: string): SpreadsheetTable {
  const lines = splitCsvLines(text);
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length === 0 || !lines.some((l) => l.trim())) {
    return { headers: [], rows: [], error: "CSV must have a header row and at least one data row." };
  }
  let headerIdx = -1;
  let delimiter = ",";
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const d = detectDelimiter(lines[i]);
    const cells = parseCSVLine(lines[i], d);
    if (isLikelyHeaderRow(cells)) {
      headerIdx = i;
      delimiter = d;
      break;
    }
  }
  if (headerIdx < 0) {
    return {
      headers: [],
      rows: [],
      error: "Could not find a header row. Use columns such as employee_number, first_name, last_name, and rate.",
    };
  }
  const headers = canonicalizeHeaders(parseCSVLine(lines[headerIdx], delimiter));
  const rows = lines
    .slice(headerIdx + 1)
    .filter((l) => l.trim())
    .map((l) => parseCSVLine(l, delimiter));
  if (rows.length === 0) {
    return { headers, rows: [], error: "CSV must have a header row and at least one data row." };
  }
  return { headers, rows };
}

export function parseXlsxTable(buffer: ArrayBuffer): SpreadsheetTable {
  try {
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const name = wb.SheetNames[0];
    if (!name) return { headers: [], rows: [], error: "Excel file has no sheets." };
    const sheet = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    return tableFromAoa(aoa);
  } catch {
    return { headers: [], rows: [], error: "Could not read Excel file." };
  }
}

export function readSpreadsheet(buffer: ArrayBuffer, filename?: string): SpreadsheetTable {
  if (looksLikeXlsx(buffer, filename)) return parseXlsxTable(buffer);
  return parseTextTable(decodeSpreadsheetBytes(buffer));
}
