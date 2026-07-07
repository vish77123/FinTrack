"use server";

/**
 * Credit-card statement actions: process an uploaded statement (text already
 * extracted client-side from the PDF), reconcile its lines against existing
 * transactions, and import the genuinely-new ones.
 *
 * Matched lines NEVER touch balances — the auto-import that created the
 * transaction already did. Imported lines apply a balance update only when
 * the caller asks (default ON for a current statement, OFF for historical
 * backfills, decided in the UI).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { applyBalanceUpdate, reverseBalanceUpdate } from "@/lib/balance";
import { parseStatementText } from "@/lib/statements/orchestrator";
import { matchStatementLines, MATCH_WINDOW_DAYS, type MatchableTransaction } from "@/lib/statements/match";

const MAX_STATEMENT_TEXT_CHARS = 300_000;

const processSchema = z.object({
  accountId: z.string().uuid("Invalid account."),
  text: z.string().min(100, "The extracted statement text looks empty.").max(MAX_STATEMENT_TEXT_CHARS, "Statement text is too large."),
  /** Set true to proceed despite a card-number mismatch (wrong-card guard). */
  force: z.boolean().optional(),
});

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function revalidateCardViews() {
  revalidatePath("/cards");
  revalidatePath("/cards/[statementId]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
}

// ═══════════════════════════════════════════════════════════
// PROCESS UPLOAD
// ═══════════════════════════════════════════════════════════

export async function processStatementAction(input: { accountId: string; text: string; force?: boolean }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const validated = processSchema.safeParse(input);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const { accountId, text, force } = validated.data;

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single();
  if (!account) return { error: "Account not found." };
  if (account.type !== "credit_card") return { error: "Statements can only be uploaded for credit-card accounts." };

  // LLM provider config follows the user's email/SMS parsing settings
  const { data: settings } = await supabase
    .from("email_sync_settings")
    .select("gemini_api_keys, gemini_model_id, nvidia_api_key, nvidia_model_id, selected_llm_provider")
    .eq("user_id", user.id)
    .maybeSingle();

  const parsed = await parseStatementText(text, {
    geminiKeys: settings?.gemini_api_keys ?? null,
    geminiModelId: settings?.gemini_model_id ?? null,
    nvidiaApiKey: settings?.nvidia_api_key ?? null,
    nvidiaModelId: settings?.nvidia_model_id ?? null,
    selectedProvider: settings?.selected_llm_provider ?? null,
  });
  if (!parsed.result) return { error: parsed.error || "Failed to parse the statement." };

  const { summary, lines, parsedBy, checksumOk, droppedLines } = parsed.result;

  // Wrong-card guard: if this card has a known last4 (alert profile) and the
  // statement names a different one, stop before writing anything
  if (!force && summary.cardLast4) {
    const { data: profile } = await supabase
      .from("account_alert_profiles")
      .select("account_last4")
      .eq("user_id", user.id)
      .eq("account_id", accountId)
      .maybeSingle();
    const expected = profile?.account_last4?.replace(/\D/g, "").slice(-4);
    if (expected && expected !== summary.cardLast4) {
      return {
        needsConfirmation: true as const,
        parsedLast4: summary.cardLast4,
        expectedLast4: expected,
      };
    }
  }

  // Fetch everything that could already represent a statement line: real
  // transactions and unapproved pending ones, on/into this card, within the
  // line date range (± the match window)
  const lineDates = lines.map((l) => l.date).sort();
  const windowStart = addDays(lineDates[0], -(MATCH_WINDOW_DAYS + 1));
  const windowEnd = addDays(lineDates[lineDates.length - 1], MATCH_WINDOW_DAYS + 1);

  const [{ data: txns }, { data: pendings }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, amount, date, type, account_id, transfer_to_account_id")
      .eq("user_id", user.id)
      .or(`account_id.eq.${accountId},transfer_to_account_id.eq.${accountId}`)
      .gte("date", windowStart)
      .lte("date", windowEnd),
    supabase
      .from("pending_transactions")
      .select("id, amount, date, type, account_id, transfer_to_account_id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .or(`account_id.eq.${accountId},transfer_to_account_id.eq.${accountId}`)
      .gte("date", windowStart)
      .lte("date", windowEnd),
  ]);

  const matchable: MatchableTransaction[] = [
    ...(txns ?? []).map((t) => ({ ...t, amount: Number(t.amount), pending: false })),
    ...(pendings ?? []).map((t) => ({ ...t, amount: Number(t.amount), pending: true })),
  ];

  const matches = matchStatementLines(lines, matchable, accountId);

  // Re-uploading the same statement replaces it (idempotent refresh). Any
  // previously imported transactions keep existing — their lines are simply
  // re-matched below.
  await supabase
    .from("card_statements")
    .delete()
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .eq("statement_date", summary.statementDate);

  const allResolved = matches.every((m) => m.status === "matched");

  const { data: statement, error: stmtError } = await supabase
    .from("card_statements")
    .insert({
      user_id: user.id,
      account_id: accountId,
      statement_date: summary.statementDate,
      period_start: summary.periodStart,
      period_end: summary.periodEnd,
      due_date: summary.dueDate,
      total_due: summary.totalDue,
      min_due: summary.minDue,
      total_debits: summary.totalDebits,
      total_credits: summary.totalCredits,
      checksum_ok: checksumOk,
      status: allResolved ? "reconciled" : "review",
      parsed_by: parsedBy,
      raw_text: text,
    })
    .select("id")
    .single();

  if (stmtError || !statement) {
    console.error("[STMT] statement insert failed:", stmtError);
    return { error: "Failed to save the statement." };
  }

  const lineRows = lines.map((line, i) => ({
    user_id: user.id,
    statement_id: statement.id,
    date: line.date,
    merchant: line.merchant,
    amount: line.amount,
    direction: line.direction,
    raw_text: line.rawText,
    match_status: matches[i].status,
    matched_transaction_id: matches[i].matchedTransactionId,
    matched_pending: matches[i].matchedPending,
    match_candidates: matches[i].candidateIds.length > 0 ? matches[i].candidateIds : null,
  }));

  const { error: linesError } = await supabase.from("statement_lines").insert(lineRows);
  if (linesError) {
    console.error("[STMT] line insert failed:", linesError);
    await supabase.from("card_statements").delete().eq("id", statement.id).eq("user_id", user.id);
    return { error: "Failed to save the statement lines." };
  }

  revalidateCardViews();

  return {
    success: true,
    statementId: statement.id,
    counts: {
      total: lines.length,
      matched: matches.filter((m) => m.status === "matched").length,
      newLines: matches.filter((m) => m.status === "new").length,
      ambiguous: matches.filter((m) => m.status === "ambiguous").length,
      dropped: droppedLines,
    },
    checksumOk,
    cardLast4: summary.cardLast4,
  };
}

// ═══════════════════════════════════════════════════════════
// CARD PASSWORD (saved once, reused for future uploads)
// ═══════════════════════════════════════════════════════════

export async function saveCardPasswordAction(accountId: string, password: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const validated = z.object({
    accountId: z.string().uuid(),
    password: z.string().min(1).max(200),
  }).safeParse({ accountId, password });
  if (!validated.success) return { error: "Invalid password." };

  const { error } = await supabase
    .from("accounts")
    .update({ statement_password: validated.data.password })
    .eq("id", validated.data.accountId)
    .eq("user_id", user.id)
    .eq("type", "credit_card");

  if (error) return { error: "Failed to save the password." };
  revalidateCardViews();
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// LINE-LEVEL REVIEW ACTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Applies an owner change to an existing transaction. When the owner is a
 * contact, a plain card expense is CONVERTED into a transfer card → contact
 * (the spend becomes a receivable on the contact account, matching how
 * splits-with-contacts work); clearing the owner converts it back. The
 * conversion follows the edit pattern: update the row first, then reverse
 * the old balance effect and apply the new one (both atomic).
 *
 * The card side is unaffected either way (expense and transfer-out both add
 * the same amount to outstanding) — only the contact side moves.
 *
 * Non-convertible rows (splits, income/refunds, bill payments, transfers to
 * non-contact accounts) just get the owner tag.
 */
async function applyOwnerToTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  transactionId: string,
  ownerAccountId: string | null
): Promise<{ error?: string }> {
  const { data: txn } = await supabase
    .from("transactions")
    .select("id, type, amount, account_id, transfer_to_account_id, split_group_id")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .single();
  if (!txn) return { error: "Linked transaction not found." };

  let convertible = false;
  if (!txn.split_group_id) {
    if (txn.type === "expense") {
      convertible = true;
    } else if (txn.type === "transfer" && txn.transfer_to_account_id) {
      const { data: target } = await supabase
        .from("accounts")
        .select("type")
        .eq("id", txn.transfer_to_account_id)
        .eq("user_id", userId)
        .single();
      convertible = target?.type === "contact";
    }
  }

  const desiredType = ownerAccountId ? "transfer" : "expense";
  const desiredTarget = ownerAccountId ?? null;
  const alreadyInShape = txn.type === desiredType && (txn.transfer_to_account_id ?? null) === desiredTarget;

  if (!convertible || alreadyInShape) {
    await supabase
      .from("transactions")
      .update({ owner_account_id: ownerAccountId })
      .eq("id", transactionId)
      .eq("user_id", userId);
    return {};
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      type: desiredType,
      transfer_to_account_id: desiredTarget,
      owner_account_id: ownerAccountId,
    })
    .eq("id", transactionId)
    .eq("user_id", userId);
  if (updateError) return { error: "Failed to update the transaction." };

  const reverse = await reverseBalanceUpdate(supabase, {
    type: txn.type,
    amount: Number(txn.amount),
    account_id: txn.account_id,
    transfer_to_account_id: txn.transfer_to_account_id,
  });
  if (reverse.error) {
    return { error: `Owner updated, but reversing the old balance effect failed (${reverse.error}). Please review your balances.` };
  }

  const apply = await applyBalanceUpdate(supabase, {
    type: desiredType,
    amount: Number(txn.amount),
    account_id: txn.account_id,
    transfer_to_account_id: desiredTarget,
  });
  if (apply.error) {
    return { error: `Owner updated, but applying the new balance effect failed (${apply.error}). Please review your balances.` };
  }

  return {};
}

export async function setLineOwnerAction(lineId: string, ownerAccountId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const validated = z.object({
    lineId: z.string().uuid(),
    ownerAccountId: z.string().uuid().nullable(),
  }).safeParse({ lineId, ownerAccountId });
  if (!validated.success) return { error: "Invalid owner selection." };

  // The owner must be one of the user's contact accounts
  if (validated.data.ownerAccountId) {
    const { data: contact } = await supabase
      .from("accounts")
      .select("id, type")
      .eq("id", validated.data.ownerAccountId)
      .eq("user_id", user.id)
      .eq("type", "contact")
      .maybeSingle();
    if (!contact) return { error: "Owner must be a contact account." };
  }

  const { data: line, error } = await supabase
    .from("statement_lines")
    .update({ owner_account_id: validated.data.ownerAccountId })
    .eq("id", validated.data.lineId)
    .eq("user_id", user.id)
    .select("matched_transaction_id")
    .single();

  if (error || !line) return { error: "Failed to update the owner." };

  // A linked transaction (matched or imported) follows the owner change,
  // including the expense ↔ transfer-to-contact conversion
  if (line.matched_transaction_id) {
    const result = await applyOwnerToTransaction(supabase, user.id, line.matched_transaction_id, validated.data.ownerAccountId);
    if (result.error) return result;
  }

  revalidateCardViews();
  return { success: true };
}

const lineDetailsSchema = z.object({
  lineId: z.string().uuid(),
  merchant: z.string().trim().min(1, "Name cannot be empty.").max(200),
  categoryId: z.string().uuid().nullable(),
});

/** Edits a parsed line's name/category; a linked transaction follows. */
export async function updateLineDetailsAction(input: { lineId: string; merchant: string; categoryId: string | null }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const validated = lineDetailsSchema.safeParse(input);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const { lineId, merchant, categoryId } = validated.data;

  const { data: line, error } = await supabase
    .from("statement_lines")
    .update({ merchant, category_id: categoryId })
    .eq("id", lineId)
    .eq("user_id", user.id)
    .select("matched_transaction_id")
    .single();

  if (error || !line) return { error: "Failed to update the line." };

  if (line.matched_transaction_id) {
    await supabase
      .from("transactions")
      .update({ note: merchant, category_id: categoryId })
      .eq("id", line.matched_transaction_id)
      .eq("user_id", user.id);
  }

  revalidateCardViews();
  return { success: true };
}

export async function resolveLineMatchAction(lineId: string, transactionId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const validated = z.object({
    lineId: z.string().uuid(),
    transactionId: z.string().uuid().nullable(),
  }).safeParse({ lineId, transactionId });
  if (!validated.success) return { error: "Invalid match selection." };

  if (validated.data.transactionId) {
    // Confirm the transaction is the user's own before linking
    const { data: txn } = await supabase
      .from("transactions")
      .select("id")
      .eq("id", validated.data.transactionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!txn) return { error: "Transaction not found." };
  }

  const { error } = await supabase
    .from("statement_lines")
    .update({
      matched_transaction_id: validated.data.transactionId,
      matched_pending: false,
      match_status: validated.data.transactionId ? "matched" : "new",
    })
    .eq("id", validated.data.lineId)
    .eq("user_id", user.id)
    .in("match_status", ["matched", "new", "ambiguous"]);

  if (error) return { error: "Failed to update the match." };
  revalidateCardViews();
  return { success: true };
}

export async function setLineIgnoredAction(lineId: string, ignored: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const validated = z.object({ lineId: z.string().uuid() }).safeParse({ lineId });
  if (!validated.success) return { error: "Invalid line." };

  const { error } = await supabase
    .from("statement_lines")
    .update({ match_status: ignored ? "ignored" : "new" })
    .eq("id", validated.data.lineId)
    .eq("user_id", user.id)
    .in("match_status", ignored ? ["new", "ambiguous"] : ["ignored"]);

  if (error) return { error: "Failed to update the line." };
  revalidateCardViews();
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// IMPORT UNMATCHED LINES AS TRANSACTIONS
// ═══════════════════════════════════════════════════════════

export async function importLinesAction(input: { statementId: string; lineIds: string[]; applyBalance: boolean }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const validated = z.object({
    statementId: z.string().uuid(),
    lineIds: z.array(z.string().uuid()).min(1, "No lines selected.").max(500),
    applyBalance: z.boolean(),
  }).safeParse(input);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const { statementId, lineIds, applyBalance } = validated.data;

  const { data: statement } = await supabase
    .from("card_statements")
    .select("id, account_id")
    .eq("id", statementId)
    .eq("user_id", user.id)
    .single();
  if (!statement) return { error: "Statement not found." };

  // Claim the lines by flipping their status conditionally — a concurrent
  // import gets zero rows back and cannot create the transactions twice
  const { data: claimed, error: claimError } = await supabase
    .from("statement_lines")
    .update({ match_status: "imported" })
    .in("id", lineIds)
    .eq("statement_id", statementId)
    .eq("user_id", user.id)
    .eq("match_status", "new")
    .select("id, date, merchant, amount, direction, owner_account_id, category_id");

  if (claimError) return { error: "Failed to import the selected lines." };
  if (!claimed || claimed.length === 0) return { error: "No importable lines found (they may already be imported)." };

  let imported = 0;
  for (const line of claimed) {
    // Debit = spend on the card; credit = refund/cashback (reduces debt).
    // An unmatched payment-received line is imported as income too — the
    // user can convert it to a transfer if they want the source tracked.
    // A contact-owned debit becomes a transfer card → contact: the spend is
    // a receivable on the contact account, not the user's own expense.
    const contactOwned = line.direction === "debit" && !!line.owner_account_id;
    const txnType = line.direction === "debit" ? (contactOwned ? "transfer" : "expense") : "income";
    const transferTo = contactOwned ? line.owner_account_id : null;

    const { data: inserted, error: insertError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: statement.account_id,
        type: txnType,
        amount: line.amount,
        date: line.date,
        note: line.merchant,
        source: "statement",
        owner_account_id: line.owner_account_id,
        category_id: line.category_id,
        transfer_to_account_id: transferTo,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      // Release the claim so the user can retry this line
      await supabase
        .from("statement_lines")
        .update({ match_status: "new" })
        .eq("id", line.id)
        .eq("user_id", user.id);
      console.error("[STMT] import insert failed:", insertError);
      return { error: `Imported ${imported} line(s), then failed on "${line.merchant}". Please retry the rest.` };
    }

    await supabase
      .from("statement_lines")
      .update({ matched_transaction_id: inserted.id })
      .eq("id", line.id)
      .eq("user_id", user.id);

    if (applyBalance) {
      const balanceResult = await applyBalanceUpdate(supabase, {
        type: txnType,
        amount: Number(line.amount),
        account_id: statement.account_id,
        transfer_to_account_id: transferTo,
      });
      if (balanceResult.error) {
        return { error: `Line "${line.merchant}" was imported, but its balance update failed (${balanceResult.error}). Please review your card balance.` };
      }
    }
    imported++;
  }

  // If nothing is left to review, mark the statement reconciled
  const { data: remaining } = await supabase
    .from("statement_lines")
    .select("id")
    .eq("statement_id", statementId)
    .eq("user_id", user.id)
    .in("match_status", ["new", "ambiguous"])
    .limit(1);

  if (!remaining || remaining.length === 0) {
    await supabase
      .from("card_statements")
      .update({ status: "reconciled" })
      .eq("id", statementId)
      .eq("user_id", user.id);
  }

  revalidateCardViews();
  return { success: true, imported };
}

// ═══════════════════════════════════════════════════════════
// SYNC CARD BALANCE FROM STATEMENT
// ═══════════════════════════════════════════════════════════

/**
 * Sets the card's outstanding_balance from the statement's total due, plus
 * any card activity recorded after the statement date (unbilled spends minus
 * later payments). This is an absolute reset, not a delta — it exists to
 * repair cards whose incremental history is incomplete (e.g. bill payments
 * were recorded but the spends they settled never were, leaving outstanding
 * negative). Only the card's latest statement may do this.
 */
export async function syncCardBalanceAction(statementId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const validated = z.object({ statementId: z.string().uuid() }).safeParse({ statementId });
  if (!validated.success) return { error: "Invalid statement." };

  const { data: statement } = await supabase
    .from("card_statements")
    .select("id, account_id, statement_date, total_due")
    .eq("id", validated.data.statementId)
    .eq("user_id", user.id)
    .single();
  if (!statement) return { error: "Statement not found." };
  if (statement.total_due === null) return { error: "This statement has no total-due figure to sync from." };

  const { data: newer } = await supabase
    .from("card_statements")
    .select("id")
    .eq("user_id", user.id)
    .eq("account_id", statement.account_id)
    .gt("statement_date", statement.statement_date)
    .limit(1);
  if (newer && newer.length > 0) {
    return { error: "Only the card's latest statement can set its balance." };
  }

  // Activity after the statement date: spends add to the due amount,
  // payments/refunds reduce it. Statement-day transactions are part of the
  // statement itself, so the window starts the day after.
  const { data: later } = await supabase
    .from("transactions")
    .select("type, amount, account_id, transfer_to_account_id")
    .eq("user_id", user.id)
    .or(`account_id.eq.${statement.account_id},transfer_to_account_id.eq.${statement.account_id}`)
    .gte("date", addDays(statement.statement_date, 1));

  let postStatementDelta = 0;
  for (const t of later || []) {
    const amount = Number(t.amount);
    if (t.type === "expense" && t.account_id === statement.account_id) {
      postStatementDelta += amount;
    } else if (t.type === "income" && t.account_id === statement.account_id) {
      postStatementDelta -= amount;
    } else if (t.type === "transfer") {
      if (t.transfer_to_account_id === statement.account_id) postStatementDelta -= amount;
      else if (t.account_id === statement.account_id) postStatementDelta += amount;
    }
  }

  const newOutstanding = Math.round((Number(statement.total_due) + postStatementDelta) * 100) / 100;

  const { error } = await supabase
    .from("accounts")
    .update({ outstanding_balance: newOutstanding })
    .eq("id", statement.account_id)
    .eq("user_id", user.id)
    .eq("type", "credit_card");

  if (error) return { error: "Failed to update the card balance." };

  revalidateCardViews();
  return { success: true, newOutstanding };
}

// ═══════════════════════════════════════════════════════════
// DELETE STATEMENT
// ═══════════════════════════════════════════════════════════

/** Removes a statement and its lines. Transactions imported from it remain. */
export async function deleteStatementAction(statementId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const validated = z.object({ statementId: z.string().uuid() }).safeParse({ statementId });
  if (!validated.success) return { error: "Invalid statement." };

  const { error } = await supabase
    .from("card_statements")
    .delete()
    .eq("id", validated.data.statementId)
    .eq("user_id", user.id);

  if (error) return { error: "Failed to delete the statement." };
  revalidateCardViews();
  return { success: true };
}
