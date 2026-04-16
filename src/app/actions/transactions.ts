"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// cc_payment is used in the pending/parsing layer; stored as 'transfer' in main transactions
const transactionSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero."),
  type: z.enum(["income", "expense", "transfer", "cc_payment"]),
  account_id: z.string().uuid("Please select a valid account."),
  category_id: z.string().optional().nullable(),
  date: z.string().datetime(), // expects ISO string
  note: z.string().optional(),
  transfer_to_account_id: z.string().uuid().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────
// CREDIT CARD-AWARE BALANCE UPDATE
// Fetches account type before deciding which column to update.
// ─────────────────────────────────────────────────────────────
async function applyBalanceUpdate(supabase: any, payload: any) {
  const amount = Number(payload.amount);

  if (payload.type === "expense" || payload.type === "income" || payload.type === "cc_payment") {
    // Fetch account type to determine which logic to use
    const { data: account } = await supabase
      .from("accounts")
      .select("type, balance, outstanding_balance")
      .eq("id", payload.account_id)
      .single();

    if (!account) return;

    if (account.type === "credit_card") {
      // Credit card: expense = more debt, income/cc_payment = less debt (floor 0)
      const delta = payload.type === "expense" ? amount : -amount;
      const newOutstanding = Math.max(0, (Number(account.outstanding_balance) || 0) + delta);
      await supabase
        .from("accounts")
        .update({ outstanding_balance: newOutstanding })
        .eq("id", payload.account_id);
    } else {
      // Bank / cash / savings / contact: original balance logic
      const delta = payload.type === "income" ? amount : -amount;
      const newBalance = (Number(account.balance) || 0) + delta;
      await supabase
        .from("accounts")
        .update({ balance: newBalance })
        .eq("id", payload.account_id);
    }

  } else if (payload.type === "transfer") {
    // Source account (always reduces)
    const { data: fromAccount } = await supabase
      .from("accounts")
      .select("type, balance, outstanding_balance")
      .eq("id", payload.account_id)
      .single();

    if (fromAccount) {
      if (fromAccount.type === "credit_card") {
        // Paying FROM a credit card (unusual, but handle it as an expense on CC)
        const newOutstanding = Math.max(0, (Number(fromAccount.outstanding_balance) || 0) + amount);
        await supabase.from("accounts").update({ outstanding_balance: newOutstanding }).eq("id", payload.account_id);
      } else {
        await supabase
          .from("accounts")
          .update({ balance: (Number(fromAccount.balance) || 0) - amount })
          .eq("id", payload.account_id);
      }
    }

    // Destination account
    if (payload.transfer_to_account_id) {
      const { data: toAccount } = await supabase
        .from("accounts")
        .select("type, balance, outstanding_balance")
        .eq("id", payload.transfer_to_account_id)
        .single();

      if (toAccount) {
        if (toAccount.type === "credit_card") {
          // Bill payment: reduce outstanding debt
          const newOutstanding = Math.max(0, (Number(toAccount.outstanding_balance) || 0) - amount);
          await supabase
            .from("accounts")
            .update({ outstanding_balance: newOutstanding })
            .eq("id", payload.transfer_to_account_id);
        } else {
          // Normal transfer: increase destination balance
          await supabase
            .from("accounts")
            .update({ balance: (Number(toAccount.balance) || 0) + amount })
            .eq("id", payload.transfer_to_account_id);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// REVERSE BALANCE UPDATE (for delete/edit flows)
// ─────────────────────────────────────────────────────────────
export async function reverseBalanceUpdate(supabase: any, payload: {
  type: string;
  amount: number;
  account_id: string;
  transfer_to_account_id?: string | null;
}) {
  const amount = Number(payload.amount);

  if (payload.type === "expense" || payload.type === "income" || payload.type === "cc_payment") {
    const { data: account } = await supabase
      .from("accounts")
      .select("type, balance, outstanding_balance")
      .eq("id", payload.account_id)
      .single();

    if (!account) return;

    if (account.type === "credit_card") {
      // Reverse: expense reversal = decrease outstanding; income reversal = increase outstanding
      const delta = payload.type === "expense" ? -amount : amount;
      const newOutstanding = Math.max(0, (Number(account.outstanding_balance) || 0) + delta);
      await supabase.from("accounts").update({ outstanding_balance: newOutstanding }).eq("id", payload.account_id);
    } else {
      const delta = payload.type === "income" ? -amount : amount;
      const newBalance = (Number(account.balance) || 0) + delta;
      await supabase.from("accounts").update({ balance: newBalance }).eq("id", payload.account_id);
    }
  } else if (payload.type === "transfer") {
    // Reverse source: add back to source
    const { data: fromAccount } = await supabase
      .from("accounts")
      .select("type, balance, outstanding_balance")
      .eq("id", payload.account_id)
      .single();

    if (fromAccount) {
      if (fromAccount.type === "credit_card") {
        const newOutstanding = Math.max(0, (Number(fromAccount.outstanding_balance) || 0) - amount);
        await supabase.from("accounts").update({ outstanding_balance: newOutstanding }).eq("id", payload.account_id);
      } else {
        await supabase
          .from("accounts")
          .update({ balance: (Number(fromAccount.balance) || 0) + amount })
          .eq("id", payload.account_id);
      }
    }

    // Reverse destination: take back from destination
    if (payload.transfer_to_account_id) {
      const { data: toAccount } = await supabase
        .from("accounts")
        .select("type, balance, outstanding_balance")
        .eq("id", payload.transfer_to_account_id)
        .single();

      if (toAccount) {
        if (toAccount.type === "credit_card") {
          // Reversing a payment: outstanding goes back up
          const newOutstanding = (Number(toAccount.outstanding_balance) || 0) + amount;
          await supabase.from("accounts").update({ outstanding_balance: newOutstanding }).eq("id", payload.transfer_to_account_id);
        } else {
          await supabase
            .from("accounts")
            .update({ balance: (Number(toAccount.balance) || 0) - amount })
            .eq("id", payload.transfer_to_account_id);
        }
      }
    }
  }
}

export async function addTransactionAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to do this." };
  }

  const isSplit = formData.get("isSplit") === "true";

  if (isSplit) {
    let splits: any[] = [];
    try {
      splits = JSON.parse(formData.get("splits") as string);
    } catch {
      return { error: "Invalid split data Format" };
    }

    const splitGroupId = crypto.randomUUID();

    for (const split of splits) {
      const payload = {
        amount: split.amount ? parseFloat(split.amount) : 0,
        type: split.type,
        account_id: split.account_id || formData.get("account_id"),
        category_id: split.category_id || null,
        date: new Date(formData.get("date") as string).toISOString(),
        // Main note (baseNote) always takes priority over per-split sub-note
        note: split.note || (formData.get("note") as string) || null,
        transfer_to_account_id: split.transfer_to_account_id || null,
      };

      const validated = transactionSchema.safeParse(payload);
      if (!validated.success) return { error: validated.error.issues[0].message };

      const { error: dbError } = await supabase.from("transactions").insert({
        user_id: user.id,
        amount: validated.data.amount,
        type: validated.data.type === "cc_payment" ? "transfer" : validated.data.type,
        account_id: validated.data.account_id,
        category_id: validated.data.category_id,
        date: validated.data.date,
        note: validated.data.note,
        transfer_to_account_id: validated.data.transfer_to_account_id,
        split_group_id: splitGroupId
      });

      if (dbError) {
        console.error("Split DB Insert Error:", dbError);
        return { error: "Failed to save split transaction." };
      }

      await applyBalanceUpdate(supabase, validated.data);
    }
  } else {
    // Extract raw form data for normal single
    const rawAmount = formData.get("amount") as string;
    const rawData = {
      amount: rawAmount ? parseFloat(rawAmount) : 0,
      type: formData.get("type") as string,
      account_id: formData.get("account_id") as string,
      category_id: formData.get("category_id") as string || null,
      date: new Date(formData.get("date") as string).toISOString(),
      note: formData.get("note") as string,
      transfer_to_account_id: formData.get("transfer_to_account_id") as string || null,
    };

    // Validate via Zod
    const validated = transactionSchema.safeParse(rawData);

    if (!validated.success) {
      // Return first validation error nicely
      return { error: validated.error.issues[0].message };
    }

    const payload = validated.data;

    // Insert into DB; cc_payment stored as transfer in main transactions
    const { error: dbError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        amount: payload.amount,
        type: payload.type === "cc_payment" ? "transfer" : payload.type,
        account_id: payload.account_id,
        category_id: payload.category_id,
        date: payload.date,
        note: payload.note,
        transfer_to_account_id: payload.transfer_to_account_id
      });

    if (dbError) {
      console.error("Database Insert Error:", dbError);
      return { error: "Failed to save transaction. Please try again." };
    }

    await applyBalanceUpdate(supabase, payload);
  }

  // Instruct Next.js cache to purge and grab fresh DB data for dashboard views
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/accounts");

  return { success: true };
}

export async function editTransactionAction(transactionId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  // Get the existing transaction to reverse the old balance effect
  const { data: existing } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .single();

  if (!existing) return { error: "Transaction not found." };

  const newAmount = parseFloat(formData.get("amount") as string);
  const newType = formData.get("type") as string;
  const newAccountId = formData.get("account_id") as string;
  const newCategoryId = formData.get("category_id") as string || null;
  const newDate = new Date(formData.get("date") as string).toISOString();
  const newNote = formData.get("note") as string || "";

  if (!newAmount || newAmount <= 0) return { error: "Amount must be greater than zero." };

  // Reverse old balance effect (CC-aware)
  await reverseBalanceUpdate(supabase, {
    type: existing.type,
    amount: Number(existing.amount),
    account_id: existing.account_id,
    transfer_to_account_id: existing.transfer_to_account_id,
  });

  // Update the transaction row
  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      amount: newAmount,
      type: newType === "cc_payment" ? "transfer" : newType,
      account_id: newAccountId,
      category_id: newCategoryId,
      date: newDate,
      note: newNote,
    })
    .eq("id", transactionId)
    .eq("user_id", user.id);

  if (updateError) return { error: "Failed to update transaction." };

  // Auto-learn merchant rule if requested
  const saveRule = formData.get("save_merchant_rule") === "true";
  if (saveRule && existing.original_synced_name) {
    await supabase.from("merchant_rules").upsert({
      user_id: user.id,
      synced_name: existing.original_synced_name,
      renamed_to: newNote,
      category_id: newCategoryId || null
    }, { onConflict: "user_id, synced_name" });
  }

  // Apply new balance effect (CC-aware)
  await applyBalanceUpdate(supabase, {
    type: newType,
    amount: newAmount,
    account_id: newAccountId,
    transfer_to_account_id: formData.get("transfer_to_account_id") as string || null,
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { success: true };
}

export async function updatePendingTransactionAction(pendingId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const newAmount = parseFloat(formData.get("amount") as string);
  const newType = formData.get("type") as string;
  const newAccountId = formData.get("account_id") as string || null;
  const newCategoryId = formData.get("category_id") as string || null;
  const newDate = new Date(formData.get("date") as string).toISOString();
  const newNote = formData.get("note") as string || "";

  if (!newAmount || newAmount <= 0) return { error: "Amount must be greater than zero." };

  const { data: existing } = await supabase
    .from("pending_transactions")
    .select("original_synced_name")
    .eq("id", pendingId)
    .eq("user_id", user.id)
    .single();

  const saveRule = formData.get("save_merchant_rule") === "true";
  if (saveRule && existing?.original_synced_name) {
    await supabase.from("merchant_rules").upsert({
      user_id: user.id,
      synced_name: existing.original_synced_name,
      renamed_to: newNote,
      category_id: newCategoryId || null
    }, { onConflict: "user_id, synced_name" });
  }

  const { error: updateError } = await supabase
    .from("pending_transactions")
    .update({
      amount: newAmount,
      type: newType,
      account_id: newAccountId,
      category_id: newCategoryId,
      date: newDate,
      note: newNote,
    })
    .eq("id", pendingId)
    .eq("user_id", user.id);

  if (updateError) return { error: "Failed to update pending transaction." };

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Converts an existing transaction (or entire split group) into new split transactions.
 *
 * @param idOrGroupId  - transaction ID (single) or split_group_id (group)
 * @param formData     - new split data
 * @param isSplitGroup - if true, idOrGroupId is treated as split_group_id
 */
export async function convertToSplitAction(idOrGroupId: string, formData: FormData, isSplitGroup = false) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  // sourceEmailId is carried from the original transaction(s) to the new split children
  // so that the Gmail sync dedup can still find a row for the original email ID.
  let sourceEmailId: string | null = null;

  if (isSplitGroup) {
    // ── GROUP EDIT: fetch all siblings, reverse all balances, delete all ──
    const { data: siblings } = await supabase
      .from("transactions")
      .select("id, type, amount, account_id, transfer_to_account_id, source_email_id")
      .eq("split_group_id", idOrGroupId)
      .eq("user_id", user.id);

    if (!siblings || siblings.length === 0) return { error: "Split group not found." };

    for (const sibling of siblings) {
      await reverseBalanceUpdate(supabase, {
        type: sibling.type,
        amount: Number(sibling.amount),
        account_id: sibling.account_id,
        transfer_to_account_id: sibling.transfer_to_account_id,
      });
    }

    const { error: delErr } = await supabase
      .from("transactions").delete().eq("split_group_id", idOrGroupId).eq("user_id", user.id);
    if (delErr) return { error: "Failed to remove original split group." };

    // Carry the source_email_id forward so the sync dedup doesn't re-import this email
    sourceEmailId = siblings.find(s => s.source_email_id)?.source_email_id ?? null;

  } else {
    // ── SINGLE EDIT: fetch one transaction, reverse its balance, delete it ──
    const { data: existing } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", idOrGroupId)
      .eq("user_id", user.id)
      .single();

    if (!existing) return { error: "Original transaction not found." };

    // Reverse balance effects (CC-aware)
    await reverseBalanceUpdate(supabase, {
      type: existing.type,
      amount: Number(existing.amount),
      account_id: existing.account_id,
      transfer_to_account_id: existing.transfer_to_account_id,
    });

    const { error: deleteError } = await supabase
      .from("transactions").delete().eq("id", idOrGroupId).eq("user_id", user.id);
    if (deleteError) return { error: "Failed to remove the original transaction during conversion." };

    // Carry the source_email_id forward so the sync dedup doesn't re-import this email
    sourceEmailId = existing.source_email_id ?? null;
  }


  // Parse split rows from formData
  let splits: any[] = [];
  try {
    splits = JSON.parse(formData.get("splits") as string);
  } catch {
    return { error: "Invalid split data." };
  }

  const accountId = formData.get("account_id") as string;
  const date = new Date(formData.get("date") as string).toISOString();
  const baseNote = (formData.get("note") as string) || null;
  const splitGroupId = crypto.randomUUID();

  // Insert each split; stamp source_email_id only on the first row (the dedup anchor)
  let isFirstSplit = true;
  for (const split of splits) {
    const payload = {
      amount: split.amount ? parseFloat(split.amount) : 0,
      type: split.type,
      account_id: split.account_id || accountId,
      category_id: split.category_id || null,
      date,
      // baseNote = main transaction name (always wins); split.note is optional per-split sub-note
      note: baseNote || split.note || null,
      transfer_to_account_id: split.transfer_to_account_id || null,
    };

    const validated = transactionSchema.safeParse(payload);
    if (!validated.success) return { error: validated.error.issues[0].message };

    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: user.id,
      amount: validated.data.amount,
      type: validated.data.type === "cc_payment" ? "transfer" : validated.data.type,
      account_id: validated.data.account_id,
      category_id: validated.data.category_id,
      date: validated.data.date,
      note: validated.data.note,
      transfer_to_account_id: validated.data.transfer_to_account_id,
      split_group_id: splitGroupId,
      // First split child inherits source_email_id so sync won't re-import this email
      ...(isFirstSplit && sourceEmailId ? { source_email_id: sourceEmailId } : {}),
    });
    isFirstSplit = false;

    if (insertError) {
      console.error("convertToSplit – insert error:", insertError);
      return { error: "Failed to save one of the split transactions." };
    }

    await applyBalanceUpdate(supabase, validated.data);
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { success: true };
}

/**
 * Collapses a split group back into a single normal transaction.
 * Called when the user edits a split parent and turns OFF split mode.
 */
export async function collapseSplitToSingleAction(splitGroupId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  // 1. Fetch all siblings
  const { data: siblings } = await supabase
    .from("transactions")
    .select("id, type, amount, account_id, transfer_to_account_id, source_email_id")
    .eq("split_group_id", splitGroupId)
    .eq("user_id", user.id);

  if (!siblings || siblings.length === 0) return { error: "Split group not found." };

  // 2. Reverse each sibling's balance (CC-aware)
  for (const sib of siblings) {
    await reverseBalanceUpdate(supabase, {
      type: sib.type,
      amount: Number(sib.amount),
      account_id: sib.account_id,
      transfer_to_account_id: sib.transfer_to_account_id,
    });
  }

  // 3. Delete all siblings
  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("split_group_id", splitGroupId)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("collapseSplitToSingle – delete error:", deleteError);
    return { error: "Failed to remove the split transactions." };
  }

  // Carry the source_email_id from the first sibling that has one (dedup anchor)
  const sourceEmailId = siblings.find(s => s.source_email_id)?.source_email_id ?? null;

  // 4. Build and validate the new single transaction payload
  const payload = {
    amount: parseFloat(formData.get("amount") as string),
    type: formData.get("type") as string,
    account_id: formData.get("account_id") as string,
    category_id: (formData.get("category_id") as string) || null,
    date: new Date(formData.get("date") as string).toISOString(),
    note: (formData.get("note") as string) || null,
    transfer_to_account_id: (formData.get("transfer_to_account_id") as string) || null,
  };

  const validated = transactionSchema.safeParse(payload);
  if (!validated.success) return { error: validated.error.issues[0].message };

  // 5. Insert the single transaction
  const { error: insertError } = await supabase.from("transactions").insert({
    user_id: user.id,
    amount: validated.data.amount,
    type: validated.data.type === "cc_payment" ? "transfer" : validated.data.type,
    account_id: validated.data.account_id,
    category_id: validated.data.category_id,
    date: validated.data.date,
    note: validated.data.note,
    transfer_to_account_id: validated.data.transfer_to_account_id,
    // no split_group_id — this is now a normal transaction
    ...(sourceEmailId ? { source_email_id: sourceEmailId } : {}),
  });

  if (insertError) {
    console.error("collapseSplitToSingle – insert error:", insertError);
    return { error: "Failed to save the merged transaction." };
  }

  await applyBalanceUpdate(supabase, validated.data);

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { success: true };
}
