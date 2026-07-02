"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { reverseBalanceUpdate } from "@/lib/balance";

export async function deleteTransactionAction(transactionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  if (!transactionId) {
    return { error: "Invalid transaction ID." };
  }

  // Claim (delete) the row in one statement. delete().select() returns the
  // deleted row, so a concurrent delete of the same transaction gets nothing
  // back and cannot reverse the balance a second time.
  const { data: txn, error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .select("id, type, amount, account_id, transfer_to_account_id")
    .maybeSingle();

  if (deleteError) {
    console.error("Failed to delete transaction:", deleteError);
    return { error: "Could not remove transaction. Try again." };
  }

  if (!txn) {
    return { error: "Transaction not found." };
  }

  // Reverse the balance effect (atomic, CC-aware)
  const reverseResult = await reverseBalanceUpdate(supabase, {
    type: txn.type,
    amount: Number(txn.amount),
    account_id: txn.account_id,
    transfer_to_account_id: txn.transfer_to_account_id,
  });

  if (reverseResult.error) {
    return { error: `Transaction removed, but reversing its balance effect failed (${reverseResult.error}). Please review your account balances.` };
  }

  // Once safely deleted and balance adjusted, clear the caches
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/accounts");

  return { success: true };
}

/**
 * Deletes ALL transactions sharing a split_group_id and reverses their balances.
 * Used when the user deletes a split parent row from the UI.
 */
export async function deleteAllSplitSiblingsAction(splitGroupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Claim (delete) all siblings atomically — concurrent invocations get zero
  // rows back and cannot double-reverse the balances.
  const { data: siblings, error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("split_group_id", splitGroupId)
    .eq("user_id", user.id)
    .select("id, type, amount, account_id, transfer_to_account_id");

  if (deleteError) {
    console.error("deleteAllSplitSiblings error:", deleteError);
    return { error: "Failed to delete split transactions." };
  }

  if (!siblings || siblings.length === 0) {
    return { error: "No split transactions found." };
  }

  // Reverse balance effects for every sibling (atomic, CC-aware)
  for (const txn of siblings) {
    const reverseResult = await reverseBalanceUpdate(supabase, {
      type: txn.type,
      amount: Number(txn.amount),
      account_id: txn.account_id,
      transfer_to_account_id: txn.transfer_to_account_id,
    });
    if (reverseResult.error) {
      return { error: `Split rows removed, but reversing a balance effect failed (${reverseResult.error}). Please review your account balances.` };
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { success: true };
}
