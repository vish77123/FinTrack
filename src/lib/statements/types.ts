/**
 * Credit-card statement parsing & reconciliation types.
 *
 * A statement is parsed LLM-first (no regex layer — full statement tables are
 * too layout-variable for regex, and volume is ~12/year/card so cost is not a
 * concern). Gemini is the primary parser, NVIDIA NIM the fallback, mirroring
 * the email/SMS pipeline's provider handling.
 */

export interface ParsedStatementSummary {
  bank: string | null;
  cardLast4: string | null;
  statementDate: string; // YYYY-MM-DD
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  totalDue: number | null;
  minDue: number | null;
  /** Statement's own printed totals — used as a parse-integrity checksum. */
  totalDebits: number | null;
  totalCredits: number | null;
}

export interface ParsedStatementLine {
  date: string; // YYYY-MM-DD
  merchant: string;
  amount: number; // always positive
  direction: "debit" | "credit";
  rawText: string | null;
}

export interface ParsedStatement {
  summary: ParsedStatementSummary;
  lines: ParsedStatementLine[];
  parsedBy: "gemini" | "nvidia";
  /**
   * sum(debit lines) vs the statement's printed totalDebits (±₹1).
   * null when the statement didn't print a total to check against.
   */
  checksumOk: boolean | null;
  /** Lines the LLM returned but which failed validation and were dropped. */
  droppedLines: number;
}

export interface StatementParseOptions {
  geminiKeys?: string[] | null;
  geminiModelId?: string | null;
  nvidiaApiKey?: string | null;
  nvidiaModelId?: string | null;
  /** User's preferred primary provider (from email_sync_settings). */
  selectedProvider?: string | null;
}
