"use server";

import { createClient } from "@/lib/supabase/server";

export interface CardStatementSummary {
  id: string;
  statement_date: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  total_due: number | null;
  min_due: number | null;
  checksum_ok: boolean | null;
  status: string;
  created_at: string;
  lineCounts: {
    total: number;
    matched: number;
    newLines: number;
    ambiguous: number;
    ignored: number;
    imported: number;
  };
}

export interface CreditCardWithStatements {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  outstanding_balance: number;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
  last4: string | null;
  hasPassword: boolean;
  statement_password: string | null;
  statements: CardStatementSummary[];
}

export interface ContactOption {
  id: string;
  name: string;
  /** Contact account balance (positive = they owe you). Cards page only. */
  balance?: number;
}

export interface CardsData {
  cards: CreditCardWithStatements[];
  contacts: ContactOption[];
  /** Set when the underlying queries failed (e.g. migration 024 not applied). */
  error: string | null;
}

/**
 * Postgres: 42703 = undefined column, 42P01 = undefined table.
 * PGRST200 = PostgREST can't find a relationship (embedded join on a column
 * whose FK doesn't exist yet).
 */
function describeQueryError(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  if (
    error.code === "42703" ||
    error.code === "42P01" ||
    error.code === "PGRST200" ||
    error.message?.includes("relationship")
  ) {
    return "The database schema is behind the app — apply the latest migrations in supabase/migrations/ (currently up to 025) in Supabase, then reload this page.";
  }
  return `Failed to load: ${error.message || "unknown error"}`;
}

export async function getCardsData(): Promise<CardsData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const [
    { data: cards, error: cardsError },
    { data: profiles },
    { data: statements, error: statementsError },
    { data: contacts },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, color, icon, outstanding_balance, credit_limit, statement_day, due_day, statement_password")
      .eq("user_id", user.id)
      .eq("type", "credit_card")
      .eq("is_archived", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("account_alert_profiles")
      .select("account_id, account_last4")
      .eq("user_id", user.id),
    supabase
      .from("card_statements")
      .select("id, account_id, statement_date, period_start, period_end, due_date, total_due, min_due, checksum_ok, status, created_at, statement_lines(match_status)")
      .eq("user_id", user.id)
      .order("statement_date", { ascending: false }),
    supabase
      .from("accounts")
      .select("id, name, balance")
      .eq("user_id", user.id)
      .eq("type", "contact")
      .eq("is_archived", false)
      .order("name", { ascending: true }),
  ]);

  if (cardsError) console.error("[CARDS] accounts query failed:", cardsError);
  if (statementsError) console.error("[CARDS] statements query failed:", statementsError);

  const last4ByAccount = new Map<string, string>();
  (profiles || []).forEach((p) => {
    if (p.account_last4) last4ByAccount.set(p.account_id, p.account_last4);
  });

  const statementsByAccount = new Map<string, CardStatementSummary[]>();
  (statements || []).forEach((s) => {
    const lines = (s.statement_lines as { match_status: string }[] | null) || [];
    const count = (status: string) => lines.filter((l) => l.match_status === status).length;
    const summary: CardStatementSummary = {
      id: s.id,
      statement_date: s.statement_date,
      period_start: s.period_start,
      period_end: s.period_end,
      due_date: s.due_date,
      total_due: s.total_due !== null ? Number(s.total_due) : null,
      min_due: s.min_due !== null ? Number(s.min_due) : null,
      checksum_ok: s.checksum_ok,
      status: s.status,
      created_at: s.created_at,
      lineCounts: {
        total: lines.length,
        matched: count("matched"),
        newLines: count("new"),
        ambiguous: count("ambiguous"),
        ignored: count("ignored"),
        imported: count("imported"),
      },
    };
    const list = statementsByAccount.get(s.account_id) || [];
    list.push(summary);
    statementsByAccount.set(s.account_id, list);
  });

  return {
    cards: (cards || []).map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      outstanding_balance: Number(c.outstanding_balance || 0),
      credit_limit: c.credit_limit !== null ? Number(c.credit_limit) : null,
      statement_day: c.statement_day,
      due_day: c.due_day,
      last4: last4ByAccount.get(c.id) || null,
      hasPassword: !!c.statement_password,
      statement_password: c.statement_password,
      statements: statementsByAccount.get(c.id) || [],
    })),
    contacts: (contacts || []).map((c) => ({ ...c, balance: Number(c.balance || 0) })),
    error: describeQueryError(cardsError) || describeQueryError(statementsError),
  };
}

export interface CategoryOption {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  type?: string;
}

export interface StatementLineDetail {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  direction: "debit" | "credit";
  match_status: string;
  matched_pending: boolean;
  matched_transaction_id: string | null;
  match_candidates: string[] | null;
  owner_account_id: string | null;
  category_id: string | null;
  category: { name: string; icon: string | null; color: string | null } | null;
  matchedTransaction: {
    id: string;
    note: string | null;
    date: string;
    amount: number;
    type: string;
    account_id: string | null;
    category_id: string | null;
    transfer_to_account_id: string | null;
    split_group_id: string | null;
    original_synced_name: string | null;
  } | null;
}

export interface AccountOption {
  id: string;
  name: string;
  type: string;
  balance: number;
}

export interface StatementDetailData {
  statement: {
    id: string;
    account_id: string;
    accountName: string;
    accountColor: string | null;
    statement_date: string;
    period_start: string | null;
    period_end: string | null;
    due_date: string | null;
    total_due: number | null;
    min_due: number | null;
    total_debits: number | null;
    total_credits: number | null;
    checksum_ok: boolean | null;
    status: string;
    parsed_by: string | null;
    /** true when this is the most recent statement for its card */
    isLatest: boolean;
  };
  lines: StatementLineDetail[];
  /** Candidate transactions referenced by ambiguous lines, for display */
  candidateTransactions: Record<string, { id: string; note: string | null; date: string; amount: number; type: string }>;
  contacts: ContactOption[];
  categories: CategoryOption[];
  /** All non-archived accounts, for the shared Add/Edit Transaction modal */
  accounts: AccountOption[];
  /** Set when the lines query failed (e.g. migration 025 not applied). */
  error: string | null;
}

export async function getStatementDetail(statementId: string): Promise<StatementDetailData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: statement } = await supabase
    .from("card_statements")
    .select("id, account_id, statement_date, period_start, period_end, due_date, total_due, min_due, total_debits, total_credits, checksum_ok, status, parsed_by, accounts(name, color)")
    .eq("id", statementId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!statement) return null;

  const MATCHED_TXN_SELECT =
    "matched_transaction:transactions!statement_lines_matched_transaction_id_fkey(id, note, date, amount, type, account_id, category_id, transfer_to_account_id, split_group_id, original_synced_name)";

  const [linesResult, { data: newer }, { data: contacts }, { data: categories }, { data: accounts }] = await Promise.all([
    supabase
      .from("statement_lines")
      .select(`id, date, merchant, amount, direction, match_status, matched_pending, matched_transaction_id, match_candidates, owner_account_id, category_id, category:categories(name, icon, color), ${MATCHED_TXN_SELECT}`)
      .eq("statement_id", statementId)
      .eq("user_id", user.id)
      .order("date", { ascending: true }),
    supabase
      .from("card_statements")
      .select("id")
      .eq("user_id", user.id)
      .eq("account_id", statement.account_id)
      .gt("statement_date", statement.statement_date)
      .limit(1),
    supabase
      .from("accounts")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("type", "contact")
      .eq("is_archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name, icon, color, type, sort_order")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("accounts")
      .select("id, name, type, balance")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("created_at", { ascending: true }),
  ]);

  let lines = linesResult.data;
  const linesError = linesResult.error;

  if (linesError) {
    console.error("[CARDS] lines query failed:", linesError);
    // Migration 025 not applied yet (category join unavailable) — degrade
    // gracefully: show the lines without category support
    const { data: fallbackLines } = await supabase
      .from("statement_lines")
      .select(`id, date, merchant, amount, direction, match_status, matched_pending, matched_transaction_id, match_candidates, owner_account_id, ${MATCHED_TXN_SELECT}`)
      .eq("statement_id", statementId)
      .eq("user_id", user.id)
      .order("date", { ascending: true });
    lines = (fallbackLines || []).map((l) => ({ ...l, category_id: null, category: null })) as unknown as typeof lines;
  }

  // Fetch the ambiguous lines' candidate transactions in one query
  const candidateIds = Array.from(
    new Set((lines || []).flatMap((l) => (l.match_candidates as string[] | null) || []))
  );
  const candidateTransactions: StatementDetailData["candidateTransactions"] = {};
  if (candidateIds.length > 0) {
    const { data: candidates } = await supabase
      .from("transactions")
      .select("id, note, date, amount, type")
      .eq("user_id", user.id)
      .in("id", candidateIds);
    (candidates || []).forEach((t) => {
      candidateTransactions[t.id] = { ...t, amount: Number(t.amount) };
    });
  }

  const accountRel = statement.accounts as { name: string; color: string | null } | { name: string; color: string | null }[] | null;
  const account = Array.isArray(accountRel) ? accountRel[0] : accountRel;

  return {
    statement: {
      id: statement.id,
      account_id: statement.account_id,
      accountName: account?.name || "Credit card",
      accountColor: account?.color || null,
      statement_date: statement.statement_date,
      period_start: statement.period_start,
      period_end: statement.period_end,
      due_date: statement.due_date,
      total_due: statement.total_due !== null ? Number(statement.total_due) : null,
      min_due: statement.min_due !== null ? Number(statement.min_due) : null,
      total_debits: statement.total_debits !== null ? Number(statement.total_debits) : null,
      total_credits: statement.total_credits !== null ? Number(statement.total_credits) : null,
      checksum_ok: statement.checksum_ok,
      status: statement.status,
      parsed_by: statement.parsed_by,
      isLatest: !newer || newer.length === 0,
    },
    lines: (lines || []).map((l) => {
      const matchedRel = l.matched_transaction as unknown;
      const matched = (Array.isArray(matchedRel) ? matchedRel[0] : matchedRel) as StatementLineDetail["matchedTransaction"];
      const categoryRel = l.category as unknown;
      const category = (Array.isArray(categoryRel) ? categoryRel[0] : categoryRel) as StatementLineDetail["category"];
      return {
        id: l.id,
        date: l.date,
        merchant: l.merchant,
        amount: Number(l.amount),
        direction: l.direction as "debit" | "credit",
        match_status: l.match_status,
        matched_pending: l.matched_pending,
        matched_transaction_id: l.matched_transaction_id,
        match_candidates: l.match_candidates as string[] | null,
        owner_account_id: l.owner_account_id,
        category_id: l.category_id,
        category: category || null,
        matchedTransaction: matched ? { ...matched, amount: Number(matched.amount) } : null,
      };
    }),
    candidateTransactions,
    contacts: contacts || [],
    // Same filter as the dashboard: hide soft-deleted categories (marked with
    // sort_order -9999), which otherwise show up as duplicates/junk
    categories: (categories || []).filter((c) => c.sort_order !== -9999),
    accounts: (accounts || []).map((a) => ({ ...a, balance: Number(a.balance || 0) })),
    error: describeQueryError(linesError),
  };
}
