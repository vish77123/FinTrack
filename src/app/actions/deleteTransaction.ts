"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { reverseBalanceUpdate } from "./transactions";

export async function deleteTransactionAction(transactionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  if (!transactionId) {
    return { error: "Invalid transaction ID." };
  }

  // 1. Fetch the transaction BEFORE deleting it — we need type, amount, account_id
  const { data: txn, error: fetchError } = await supabase
    .from("transactions")
    .select("id, type, amount, account_id, transfer_to_account_id")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !txn) {
    console.error("Failed to fetch transaction for deletion:", fetchError);
    return { error: "Transaction not found." };
  }

  // 2. Delete the transaction
  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("Failed to delete transaction:", deleteError);
    return { error: "Could not remove transaction. Try again." };
  }

  // 3. Reverse balance using CC-aware logic
  await reverseBalanceUpdate(supabase, {
    type: txn.type,
    amount: Number(txn.amount),
    account_id: txn.account_id,
    transfer_to_account_id: txn.transfer_to_account_id,
  });

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

  // Fetch all siblings
  const { data: siblings, error: fetchError } = await supabase
    .from("transactions")
    .select("id, type, amount, account_id, transfer_to_account_id")
    .eq("split_group_id", splitGroupId)
    .eq("user_id", user.id);

  if (fetchError || !siblings || siblings.length === 0) {
    return { error: "No split transactions found." };
  }

  // Reverse balance effects for every sibling (CC-aware)
  for (const txn of siblings) {
    await reverseBalanceUpdate(supabase, {
      type: txn.type,
      amount: Number(txn.amount),
      account_id: txn.account_id,
      transfer_to_account_id: txn.transfer_to_account_id,
    });
  }

  // Delete all sibling rows
  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("split_group_id", splitGroupId)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("deleteAllSplitSiblings error:", deleteError);
    return { error: "Failed to delete split transactions." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { success: true };
}
