/**
 * Shared prompt + response normalization for the statement parsers.
 * Tuned for HDFC, Axis, and American Express (India) statement layouts.
 */

import type { ParsedStatement, ParsedStatementLine, ParsedStatementSummary } from "./types";

export function buildStatementPrompt(statementText: string): string {
  return `You are an expert financial extraction engine. The text below is extracted from an Indian credit-card statement PDF (HDFC Bank, Axis Bank, or American Express).

Return ONLY a raw JSON object (no markdown, no explanation) with this exact shape:
{
  "bank": "HDFC" | "AXIS" | "AMEX" | null,
  "cardLast4": "1234" | null,
  "statementDate": "YYYY-MM-DD",
  "periodStart": "YYYY-MM-DD" | null,
  "periodEnd": "YYYY-MM-DD" | null,
  "dueDate": "YYYY-MM-DD" | null,
  "totalDue": number | null,
  "minDue": number | null,
  "totalDebits": number | null,
  "totalCredits": number | null,
  "lines": [
    { "date": "YYYY-MM-DD", "merchant": "string", "amount": number, "direction": "debit" | "credit" }
  ]
}

Extraction rules:
1. "lines" must contain EVERY row of the transaction table(s) — domestic and international sections, fees, GST, interest, EMI debits, cashback, refunds, and payments received. Do NOT include summary rows (opening/previous balance, total dues, minimum amount due, credit limit).
2. "amount" is a plain positive number — strip currency symbols, commas, and "Cr"/"CR"/"DR" markers.
3. "direction": "credit" for payments received, refunds, reversals, and cashback (HDFC/Axis mark these with a "Cr" suffix; AMEX shows "CR" or a minus sign). Everything else — purchases, fees, charges, interest, EMIs — is "debit".
4. Dates: output as YYYY-MM-DD. Statement rows often show only DD/MM — infer the year from the statement period (a row dated December in a January statement belongs to the previous year).
5. "cardLast4": ONLY the last 4 digits of the card number. AMEX prints 5 visible digits (e.g. "XXXXX 51005") — return the last 4 of those ("1005").
6. "totalDebits" / "totalCredits": the statement's own printed totals for purchases/debits and payments/credits for THIS period, if present. Do not compute them yourself — copy the printed figure or return null.
7. "merchant": clean readable payee name (drop trailing city/country codes and reference numbers).
8. Personal details in the text have been replaced with tokens like [NAME], [ADDRESS], [EMAIL], [PHONE], [PAN], [AADHAAR], [GSTIN], [IFSC], XXXX-XXXX-XXXX-1234 — ignore them; they are never transactions. Masked card forms still end with the real last 4 digits (use them for "cardLast4").

STATEMENT TEXT:
${statementText}`;
}

/** Strips markdown fences and finds the outermost JSON object. */
export function extractJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Validates and normalizes a raw LLM response into a ParsedStatement,
 * computing the debit-total checksum. Returns an error when the response is
 * structurally unusable (so the caller can fall back to the next provider).
 */
export function finalizeStatement(
  raw: unknown,
  parsedBy: "gemini" | "nvidia"
): { result?: ParsedStatement; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "Parser returned no JSON object." };
  const obj = raw as Record<string, unknown>;

  const rawLines = Array.isArray(obj.lines) ? obj.lines : null;
  if (!rawLines) return { error: "Parser response has no transaction lines array." };

  const statementDate = asIsoDate(obj.statementDate);
  if (!statementDate) return { error: "Parser could not determine the statement date." };

  let droppedLines = 0;
  const lines: ParsedStatementLine[] = [];
  for (const entry of rawLines) {
    const line = entry as Record<string, unknown>;
    const date = asIsoDate(line.date);
    const amount = asNumber(line.amount);
    const direction = line.direction === "credit" ? "credit" : line.direction === "debit" ? "debit" : null;
    if (!date || !amount || amount <= 0 || !direction) {
      droppedLines++;
      continue;
    }
    lines.push({
      date,
      merchant: typeof line.merchant === "string" && line.merchant.trim() ? line.merchant.trim() : "Unknown merchant",
      amount: Math.round(amount * 100) / 100,
      direction,
      rawText: typeof line.rawText === "string" ? line.rawText : null,
    });
  }

  if (lines.length === 0) return { error: "No valid transaction lines could be parsed from the statement." };

  const last4Raw = typeof obj.cardLast4 === "string" ? obj.cardLast4.replace(/\D/g, "") : "";

  const summary: ParsedStatementSummary = {
    bank: typeof obj.bank === "string" ? obj.bank : null,
    cardLast4: last4Raw.length >= 4 ? last4Raw.slice(-4) : null,
    statementDate,
    periodStart: asIsoDate(obj.periodStart),
    periodEnd: asIsoDate(obj.periodEnd),
    dueDate: asIsoDate(obj.dueDate),
    totalDue: asNumber(obj.totalDue),
    minDue: asNumber(obj.minDue),
    totalDebits: asNumber(obj.totalDebits),
    totalCredits: asNumber(obj.totalCredits),
  };

  let checksumOk: boolean | null = null;
  if (summary.totalDebits !== null) {
    const sumDebits = lines
      .filter((l) => l.direction === "debit")
      .reduce((acc, l) => acc + l.amount, 0);
    checksumOk = Math.abs(sumDebits - summary.totalDebits) <= 1;
  }

  return { result: { summary, lines, parsedBy, checksumOk, droppedLines } };
}

// PII masking lives in ./redact.ts (redactStatementText) — applied by the
// server action before parsing/storage, and again inside each parser as
// defense in depth.
