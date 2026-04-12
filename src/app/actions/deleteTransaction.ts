"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

  // 3. Adjust the account balance at the application level
  //    This ensures correct behavior regardless of whether the DB trigger executed.
  //    Reversing the original transaction effect:
  //    - Expense was: balance - amount → reverse: balance + amount
  //    - Income was: balance + amount → reverse: balance - amount
  //    - Transfer was: from balance - amount, to balance + amount → reverse both
  const amount = Number(txn.amount);

  if (txn.type === "expense") {
    // Reverse expense: add back to account
    const { data: account } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", txn.account_id)
      .single();

    if (account) {
      await supabase
        .from("accounts")
        .update({ balance: Number(account.balance) + amount })
        .eq("id", txn.account_id);
    }
  } else if (txn.type === "income") {
    // Reverse income: subtract from account
    const { data: account } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", txn.account_id)
      .single();

    if (account) {
      await supabase
        .from("accounts")
        .update({ balance: Number(account.balance) - amount })
        .eq("id", txn.account_id);
    }
  } else if (txn.type === "transfer") {
    // Reverse transfer: add back to source, subtract from destination
    const { data: fromAccount } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", txn.account_id)
      .single();

    if (fromAccount) {
      await supabase
        .from("accounts")
        .update({ balance: Number(fromAccount.balance) + amount })
        .eq("id", txn.account_id);
    }

    if (txn.transfer_to_account_id) {
      const { data: toAccount } = await supabase
        .from("accounts")
        .select("balance")
        .eq("id", txn.transfer_to_account_id)
        .single();

      if (toAccount) {
        await supabase
          .from("accounts")
          .update({ balance: Number(toAccount.balance) - amount })
          .eq("id", txn.transfer_to_account_id);
      }
    }
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

  // Fetch all siblings
  const { data: siblings, error: fetchError } = await supabase
    .from("transactions")
    .select("id, type, amount, account_id, transfer_to_account_id")
    .eq("split_group_id", splitGroupId)
    .eq("user_id", user.id);

  if (fetchError || !siblings || siblings.length === 0) {
    return { error: "No split transactions found." };
  }

  // Reverse balance effects for every sibling
  for (const txn of siblings) {
    const amount = Number(txn.amount);
    if (txn.type === "expense") {
      const { data: acct } = await supabase.from("accounts").select("balance").eq("id", txn.account_id).single();
      if (acct) await supabase.from("accounts").update({ balance: Number(acct.balance) + amount }).eq("id", txn.account_id);
    } else if (txn.type === "income") {
      const { data: acct } = await supabase.from("accounts").select("balance").eq("id", txn.account_id).single();
      if (acct) await supabase.from("accounts").update({ balance: Number(acct.balance) - amount }).eq("id", txn.account_id);
    } else if (txn.type === "transfer") {
      const { data: from } = await supabase.from("accounts").select("balance").eq("id", txn.account_id).single();
      if (from) await supabase.from("accounts").update({ balance: Number(from.balance) + amount }).eq("id", txn.account_id);
      if (txn.transfer_to_account_id) {
        const { data: to } = await supabase.from("accounts").select("balance").eq("id", txn.transfer_to_account_id).single();
        if (to) await supabase.from("accounts").update({ balance: Number(to.balance) - amount }).eq("id", txn.transfer_to_account_id);
      }
    }
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
