"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { applyBalanceUpdate, reverseBalanceUpdate } from "@/lib/balance";

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

// Balance updates live in src/lib/balance.ts: deltas are applied atomically
// in Postgres so concurrent mutations can't overwrite each other, and every
// call returns an error that MUST be surfaced to the user.

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

      const balanceResult = await applyBalanceUpdate(supabase, validated.data);
      if (balanceResult.error) {
        return { error: `A split row was saved but its account balance could not be updated (${balanceResult.error}). Please review your balances.` };
      }
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
    const { data: inserted, error: dbError } = await supabase
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
      })
      .select("id")
      .single();

    if (dbError || !inserted) {
      console.error("Database Insert Error:", dbError);
      return { error: "Failed to save transaction. Please try again." };
    }

    const balanceResult = await applyBalanceUpdate(supabase, payload);
    if (balanceResult.error) {
      // Compensate: remove the row so a retry doesn't double-record it
      await supabase.from("transactions").delete().eq("id", inserted.id).eq("user_id", user.id);
      return { error: balanceResult.error };
    }
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

  // Update the transaction row FIRST — if this fails, no balance has been
  // touched yet and the previous state remains fully consistent.
  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      amount: newAmount,
      type: newType === "cc_payment" ? "transfer" : newType,
      account_id: newAccountId,
      category_id: newCategoryId,
      transfer_to_account_id: formData.get("transfer_to_account_id") as string || null,
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

  // Reverse the old balance effect, then apply the new one (both atomic)
  const reverseResult = await reverseBalanceUpdate(supabase, {
    type: existing.type,
    amount: Number(existing.amount),
    account_id: existing.account_id,
    transfer_to_account_id: existing.transfer_to_account_id,
  });
  if (reverseResult.error) {
    return { error: `Transaction updated, but reversing its old balance effect failed (${reverseResult.error}). Please review your account balances.` };
  }

  const applyResult = await applyBalanceUpdate(supabase, {
    type: newType,
    amount: newAmount,
    account_id: newAccountId,
    transfer_to_account_id: formData.get("transfer_to_account_id") as string || null,
  });
  if (applyResult.error) {
    return { error: `Transaction updated, but applying its new balance effect failed (${applyResult.error}). Please review your account balances.` };
  }

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

  const newTransferToAccountId = formData.get("transfer_to_account_id") as string || null;

  const { error: updateError } = await supabase
    .from("pending_transactions")
    .update({
      amount: newAmount,
      type: newType,
      account_id: newAccountId,
      category_id: newCategoryId,
      date: newDate,
      note: newNote,
      transfer_to_account_id: newTransferToAccountId,
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

  // Parse and validate ALL split rows BEFORE touching the originals — a bad
  // form must not delete the existing transaction(s).
  let splits: any[] = [];
  try {
    splits = JSON.parse(formData.get("splits") as string);
  } catch {
    return { error: "Invalid split data." };
  }

  const accountId = formData.get("account_id") as string;
  const date = new Date(formData.get("date") as string).toISOString();
  const baseNote = (formData.get("note") as string) || null;

  const validatedSplits: z.infer<typeof transactionSchema>[] = [];
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
    validatedSplits.push(validated.data);
  }

  // sourceEmailId is carried from the original transaction(s) to the new split children
  // so that the Gmail sync dedup can still find a row for the original email ID.
  let sourceEmailId: string | null = null;

  if (isSplitGroup) {
    // ── GROUP EDIT: claim (delete) all siblings atomically, then reverse ──
    // delete().select() claims the rows in one statement: a concurrent
    // invocation gets zero rows back and cannot double-reverse the balances.
    const { data: siblings, error: claimError } = await supabase
      .from("transactions")
      .delete()
      .eq("split_group_id", idOrGroupId)
      .eq("user_id", user.id)
      .select("id, type, amount, account_id, transfer_to_account_id, source_email_id");

    if (claimError) return { error: "Failed to remove original split group." };
    if (!siblings || siblings.length === 0) return { error: "Split group not found." };

    for (const sibling of siblings) {
      const reverseResult = await reverseBalanceUpdate(supabase, {
        type: sibling.type,
        amount: Number(sibling.amount),
        account_id: sibling.account_id,
        transfer_to_account_id: sibling.transfer_to_account_id,
      });
      if (reverseResult.error) {
        return { error: `Original split removed, but reversing its balance effect failed (${reverseResult.error}). Please review your account balances.` };
      }
    }

    // Carry the source_email_id forward so the sync dedup doesn't re-import this email
    sourceEmailId = siblings.find(s => s.source_email_id)?.source_email_id ?? null;

  } else {
    // ── SINGLE EDIT: claim (delete) the transaction, then reverse its balance ──
    const { data: existing, error: claimError } = await supabase
      .from("transactions")
      .delete()
      .eq("id", idOrGroupId)
      .eq("user_id", user.id)
      .select("type, amount, account_id, transfer_to_account_id, source_email_id")
      .maybeSingle();

    if (claimError) return { error: "Failed to remove the original transaction during conversion." };
    if (!existing) return { error: "Original transaction not found." };

    const reverseResult = await reverseBalanceUpdate(supabase, {
      type: existing.type,
      amount: Number(existing.amount),
      account_id: existing.account_id,
      transfer_to_account_id: existing.transfer_to_account_id,
    });
    if (reverseResult.error) {
      return { error: `Original transaction removed, but reversing its balance effect failed (${reverseResult.error}). Please review your account balances.` };
    }

    // Carry the source_email_id forward so the sync dedup doesn't re-import this email
    sourceEmailId = existing.source_email_id ?? null;
  }


  const splitGroupId = crypto.randomUUID();

  // Insert each (pre-validated) split; stamp source_email_id only on the
  // first row (the dedup anchor)
  let isFirstSplit = true;
  for (const splitData of validatedSplits) {
    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: user.id,
      amount: splitData.amount,
      type: splitData.type === "cc_payment" ? "transfer" : splitData.type,
      account_id: splitData.account_id,
      category_id: splitData.category_id,
      date: splitData.date,
      note: splitData.note,
      transfer_to_account_id: splitData.transfer_to_account_id,
      split_group_id: splitGroupId,
      // First split child inherits source_email_id so sync won't re-import this email
      ...(isFirstSplit && sourceEmailId ? { source_email_id: sourceEmailId } : {}),
    });
    isFirstSplit = false;

    if (insertError) {
      console.error("convertToSplit – insert error:", insertError);
      return { error: "Failed to save one of the split transactions." };
    }

    const balanceResult = await applyBalanceUpdate(supabase, splitData);
    if (balanceResult.error) {
      return { error: `A split row was saved but its account balance could not be updated (${balanceResult.error}). Please review your balances.` };
    }
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

  // 1. Build and validate the new single transaction payload BEFORE deleting
  //    anything — an invalid form must not destroy the original split rows.
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

  // 2. Claim (delete) all siblings atomically — a concurrent invocation gets
  //    zero rows back and cannot double-reverse the balances.
  const { data: siblings, error: claimError } = await supabase
    .from("transactions")
    .delete()
    .eq("split_group_id", splitGroupId)
    .eq("user_id", user.id)
    .select("id, type, amount, account_id, transfer_to_account_id, source_email_id");

  if (claimError) {
    console.error("collapseSplitToSingle – delete error:", claimError);
    return { error: "Failed to remove the split transactions." };
  }
  if (!siblings || siblings.length === 0) return { error: "Split group not found." };

  // 3. Reverse each sibling's balance (atomic, CC-aware)
  for (const sib of siblings) {
    const reverseResult = await reverseBalanceUpdate(supabase, {
      type: sib.type,
      amount: Number(sib.amount),
      account_id: sib.account_id,
      transfer_to_account_id: sib.transfer_to_account_id,
    });
    if (reverseResult.error) {
      return { error: `Split rows removed, but reversing a balance effect failed (${reverseResult.error}). Please review your account balances.` };
    }
  }

  // Carry the source_email_id from the first sibling that has one (dedup anchor)
  const sourceEmailId = siblings.find(s => s.source_email_id)?.source_email_id ?? null;

  // 4. Insert the single transaction
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

  const applyResult = await applyBalanceUpdate(supabase, validated.data);
  if (applyResult.error) {
    return { error: `Merged transaction saved but its balance update failed (${applyResult.error}). Please review your balances.` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { success: true };
}
