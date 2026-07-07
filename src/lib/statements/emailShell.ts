/**
 * Statement-notification email detection for the Gmail sync.
 *
 * "Your statement is ready" emails aren't transactions — instead of letting
 * them fall through the transaction parsers, the sync extracts the summary
 * figures (total due, min due, due date) with regexes and pre-creates a
 * card_statements shell. Uploading the PDF later replaces the shell with the
 * fully parsed, reconciled statement (same user/account/statement_date key).
 */

export function looksLikeStatementEmail(subject: string): boolean {
  const s = subject.toLowerCase();
  if (!/\be-?statement\b|\bstatement\b/.test(s)) return false;
  // "mini statement", OTPs and marketing shouldn't create shells
  return !/mini statement|otp|offer|reward/i.test(s);
}

export interface StatementEmailSummary {
  statementDate: string; // YYYY-MM-DD
  dueDate: string | null;
  totalDue: number | null;
  minDue: number | null;
  last4: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parses "12/06/2026", "12-06-26", "12 Jun 2026", "June 12, 2026" → ISO date. */
function parseIndianDate(raw: string): string | null {
  const cleaned = raw.trim();

  let m = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const month = Number(mm);
    const day = Number(dd);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null;
  }

  m = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})$/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${year}-${String(month).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }

  m = cleaned.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${year}-${String(month).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
  }

  return null;
}

const DATE_TOKEN = String.raw`(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{2,4})`;
const AMOUNT_TOKEN = String.raw`(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)`;

function extractAmount(text: string, labelPattern: string): number | null {
  const re = new RegExp(labelPattern + String.raw`[^0-9₹]{0,20}` + AMOUNT_TOKEN, "i");
  const m = text.match(re);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractDate(text: string, labelPattern: string): string | null {
  const re = new RegExp(labelPattern + String.raw`[^0-9A-Za-z]{0,10}` + DATE_TOKEN, "i");
  const m = text.match(re);
  return m ? parseIndianDate(m[1]) : null;
}

export function extractStatementSummary(text: string, receivedAtIso: string): StatementEmailSummary | null {
  const totalDue = extractAmount(text, String.raw`total\s+(?:amount\s+)?due`);
  const minDue = extractAmount(text, String.raw`min(?:imum)?\s+(?:amount\s+)?due`);
  const dueDate = extractDate(text, String.raw`(?:payment\s+)?due\s+(?:date|by|on)`);
  const statementDate =
    extractDate(text, String.raw`statement\s+(?:date|dated)`) ||
    receivedAtIso.slice(0, 10); // statement emails arrive on/near statement date

  const last4Match = text.match(/(?:card|account)\s*(?:no\.?|number)?\s*(?:ending|ending in|ending with)?\s*(?:x+|\*+)?\s?(\d{4,5})\b/i);
  const last4Digits = last4Match ? last4Match[1].slice(-4) : null;

  // A shell without a total due is useless — bail rather than create noise
  if (totalDue === null) return null;

  return { statementDate, dueDate, totalDue, minDue, last4: last4Digits };
}
