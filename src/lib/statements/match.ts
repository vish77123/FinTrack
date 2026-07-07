/**
 * Statement reconciliation matcher.
 *
 * Matches parsed statement lines against transactions the app already has
 * (auto-imported from email/SMS, or entered manually) so a statement upload
 * never duplicates them. Pure function — the caller fetches candidates.
 *
 * Matching key: exact amount + date within ±MATCH_WINDOW_DAYS (banks post
 * late). Merchant text is NOT compared — bank statement descriptors rarely
 * equal the app's note. Ties (multiple equally-close candidates) are marked
 * ambiguous for the user to resolve rather than guessed.
 */

import type { ParsedStatementLine } from "./types";

export const MATCH_WINDOW_DAYS = 3;

export interface MatchableTransaction {
  id: string;
  amount: number;
  date: string; // ISO timestamp or date
  type: string; // 'expense' | 'income' | 'transfer' | 'cc_payment' (pending)
  account_id: string | null;
  transfer_to_account_id: string | null;
  /** true when this is an unapproved pending_transactions row */
  pending: boolean;
}

export interface LineMatchResult {
  status: "matched" | "new" | "ambiguous";
  /** Set for matches against real transactions; null for pending matches. */
  matchedTransactionId: string | null;
  /** Line matched an unapproved pending transaction (still no duplicate). */
  matchedPending: boolean;
  /** Real-transaction candidates when ambiguous. */
  candidateIds: string[];
}

function dayDiff(a: string, b: string): number {
  const ms = Math.abs(new Date(a).setHours(0, 0, 0, 0) - new Date(b).setHours(0, 0, 0, 0));
  return Math.round(ms / 86_400_000);
}

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function isCandidate(line: ParsedStatementLine, txn: MatchableTransaction, cardAccountId: string): boolean {
  if (!amountsEqual(Number(txn.amount), line.amount)) return false;
  if (dayDiff(txn.date, line.date) > MATCH_WINDOW_DAYS) return false;

  if (line.direction === "debit") {
    // Money left the card: an expense on the card, or a transfer out of it
    return (
      (txn.type === "expense" || txn.type === "transfer") &&
      txn.account_id === cardAccountId &&
      txn.transfer_to_account_id !== cardAccountId
    );
  }

  // Money arrived on the card: a bill payment (transfer/cc_payment INTO the
  // card) or a refund/cashback recorded as income on the card
  return (
    ((txn.type === "transfer" || txn.type === "cc_payment") && txn.transfer_to_account_id === cardAccountId) ||
    (txn.type === "income" && txn.account_id === cardAccountId)
  );
}

/**
 * Returns one result per line, in the same order as `lines`. Matched real
 * transactions are claimed greedily (a transaction can satisfy only one line).
 */
export function matchStatementLines(
  lines: ParsedStatementLine[],
  existing: MatchableTransaction[],
  cardAccountId: string
): LineMatchResult[] {
  const claimed = new Set<string>();
  const results: LineMatchResult[] = new Array(lines.length);

  // Process by date for deterministic greedy claiming, but keep input order
  const order = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.date.localeCompare(b.line.date));

  for (const { line, index } of order) {
    const candidates = existing
      .filter((txn) => !claimed.has(txn.id) && isCandidate(line, txn, cardAccountId))
      .sort((a, b) => dayDiff(a.date, line.date) - dayDiff(b.date, line.date));

    // Real transactions beat pending ones at equal date distance
    const real = candidates.filter((c) => !c.pending);
    const pool = real.length > 0 ? real : candidates;

    if (pool.length === 0) {
      results[index] = { status: "new", matchedTransactionId: null, matchedPending: false, candidateIds: [] };
      continue;
    }

    const best = pool[0];
    const bestDiff = dayDiff(best.date, line.date);
    const contenders = pool.filter((c) => dayDiff(c.date, line.date) === bestDiff);

    if (contenders.length > 1) {
      // Equally plausible candidates — let the user pick (pending rows can't
      // be linked, so only real transactions are offered)
      results[index] = {
        status: "ambiguous",
        matchedTransactionId: null,
        matchedPending: false,
        candidateIds: real.map((c) => c.id),
      };
      continue;
    }

    claimed.add(best.id);
    results[index] = {
      status: "matched",
      matchedTransactionId: best.pending ? null : best.id,
      matchedPending: best.pending,
      candidateIds: [],
    };
  }

  return results;
}
