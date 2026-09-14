/** Quoted-field CSV line parser. Handles `"`, `""` escapes, and commas in quotes. */
export function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ",") {
      values.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  values.push(cur.trim());
  return values;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidYmd(year: string, month: number, day: number): boolean {
  if (!/^\d{4}$/.test(year) || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Number(year), month - 1, day);
  return dt.getFullYear() === Number(year) && dt.getMonth() === month - 1 && dt.getDate() === day;
}

/**
 * Normalize CSV dates to ISO `YYYY-MM-DD`.
 *
 * - ISO dates pass through.
 * - Slash/dash dates where one part is > 12 are unambiguous (D/M vs M/D).
 * - Ambiguous dates (both parts ≤ 12) are treated as Excel M/D/Y, which matches
 *   Windows CSV exports such as the truck-driver payslip file (`6/1/2026` → June 1).
 * - Unparseable values return `""` so callers can store NULL instead of a bad date.
 */
export function parseDateToISO(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  const trimmed = dateStr.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slash = trimmed.split("/");
  const dash = trimmed.split("-");
  const parts = slash.length === 3 ? slash : dash.length === 3 ? dash : null;
  if (!parts) return "";

  const [a, b, c] = parts;

  if (a.length === 4) {
    const year = a;
    const month = parseInt(b, 10);
    const day = parseInt(c, 10);
    if (Number.isNaN(month) || Number.isNaN(day) || !isValidYmd(year, month, day)) return "";
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const year = c.length === 2 ? `20${c}` : c;
  const n1 = parseInt(a, 10);
  const n2 = parseInt(b, 10);
  if (Number.isNaN(n1) || Number.isNaN(n2)) return "";

  let month: number;
  let day: number;
  if (n1 > 12 && n2 <= 12) {
    day = n1;
    month = n2;
  } else if (n2 > 12 && n1 <= 12) {
    month = n1;
    day = n2;
  } else {
    month = n1;
    day = n2;
  }

  if (!isValidYmd(year, month, day)) return "";
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function splitCsvLines(text: string): string[] {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}
