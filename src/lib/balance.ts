/**
 * Shared balance-mutation helpers for transaction, delete, and Gmail/SMS
 * approval actions.
 *
 * Deltas are applied atomically in Postgres via the increment_account_balance
 * / increment_cc_outstanding RPCs (see
 * supabase/migrations/20260702120000_atomic_balance_updates.sql), so
 * concurrent mutations cannot overwrite each other's updates.
 *
 * reverseBalanceUpdate() is applyBalanceUpdate() with the sign flipped, which
 * guarantees apply and reverse are exact inverses — including for credit
 * cards, where outstanding_balance is no longer floored at 0 (an overpayment
 * is a negative outstanding, i.e. a credit on the card; the dashboard clamps
 * it to 0 for net-worth and CC-debt display).
 */

export interface BalancePayload {
  type: string;
  amount: number;
  account_id: string | null;
  transfer_to_account_id?: string | null;
}

export interface BalanceResult {
  error?: string;
}

async function getAccountType(
  supabase: any,
  accountId: string
): Promise<{ type?: string; error?: string }> {
  const { data, error } = await supabase
    .from("accounts")
    .select("type")
    .eq("id", accountId)
    .single();

  if (error || !data) {
    return { error: `Could not load account for balance update: ${error?.message || "not found"}` };
  }
  return { type: data.type };
}

async function incrementBalance(
  supabase: any,
  accountId: string,
  delta: number
): Promise<BalanceResult> {
  const { error } = await supabase.rpc("increment_account_balance", {
    p_account_id: accountId,
    p_delta: delta,
  });
  if (error) {
    console.error("[BALANCE] increment_account_balance failed:", error.message);
    return { error: `Balance update failed: ${error.message}` };
  }
  return {};
}

async function incrementCCOutstanding(
  supabase: any,
  accountId: string,
  delta: number
): Promise<BalanceResult> {
  const { error } = await supabase.rpc("increment_cc_outstanding", {
    p_account_id: accountId,
    p_delta: delta,
  });
  if (error) {
    console.error("[BALANCE] increment_cc_outstanding failed:", error.message);
    return { error: `Balance update failed: ${error.message}` };
  }
  return {};
}

/**
 * Applies the balance effect of a transaction to the affected account(s).
 * Pass sign = -1 to reverse a previously applied effect.
 */
export async function applyBalanceUpdate(
  supabase: any,
  payload: BalancePayload,
  sign: 1 | -1 = 1
): Promise<BalanceResult> {
  const amount = Number(payload.amount) * sign;

  if (payload.type === "expense" || payload.type === "income" || payload.type === "cc_payment") {
    if (!payload.account_id) return {};

    const account = await getAccountType(supabase, payload.account_id);
    if (account.error) return { error: account.error };

    if (account.type === "credit_card") {
      // Credit card: expense = more debt; income / cc_payment = less debt
      const delta = payload.type === "expense" ? amount : -amount;
      return incrementCCOutstanding(supabase, payload.account_id, delta);
    }

    // Bank / cash / savings / contact
    const delta = payload.type === "income" ? amount : -amount;
    return incrementBalance(supabase, payload.account_id, delta);
  }

  if (payload.type === "transfer") {
    // Source account: money leaves (on a credit card that means more debt)
    if (payload.account_id) {
      const from = await getAccountType(supabase, payload.account_id);
      if (from.error) return { error: from.error };

      const result =
        from.type === "credit_card"
          ? await incrementCCOutstanding(supabase, payload.account_id, amount)
          : await incrementBalance(supabase, payload.account_id, -amount);
      if (result.error) return result;
    }

    // Destination account: money arrives (on a credit card that means less debt)
    if (payload.transfer_to_account_id) {
      const to = await getAccountType(supabase, payload.transfer_to_account_id);
      if (to.error) return { error: to.error };

      return to.type === "credit_card"
        ? incrementCCOutstanding(supabase, payload.transfer_to_account_id, -amount)
        : incrementBalance(supabase, payload.transfer_to_account_id, amount);
    }
  }

  return {};
}

/** Reverses the balance effect of a transaction (exact inverse of apply). */
export async function reverseBalanceUpdate(
  supabase: any,
  payload: BalancePayload
): Promise<BalanceResult> {
  return applyBalanceUpdate(supabase, payload, -1);
}
