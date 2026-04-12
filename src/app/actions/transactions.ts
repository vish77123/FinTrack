"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const transactionSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero."),
  type: z.enum(["income", "expense", "transfer"]),
  account_id: z.string().uuid("Please select a valid account."),
  category_id: z.string().optional().nullable(),
  date: z.string().datetime(), // expects ISO string
  note: z.string().optional(),
  transfer_to_account_id: z.string().uuid().optional().nullable(),
});

async function applyBalanceUpdate(supabase: any, payload: any) {
  const amount = payload.amount;
  if (payload.type === "expense") {
    const { data: account } = await supabase.from("accounts").select("balance").eq("id", payload.account_id).single();
    if (account) await supabase.from("accounts").update({ balance: Number(account.balance) - amount }).eq("id", payload.account_id);
  } else if (payload.type === "income") {
    const { data: account } = await supabase.from("accounts").select("balance").eq("id", payload.account_id).single();
    if (account) await supabase.from("accounts").update({ balance: Number(account.balance) + amount }).eq("id", payload.account_id);
  } else if (payload.type === "transfer") {
    const { data: fromAccount } = await supabase.from("accounts").select("balance").eq("id", payload.account_id).single();
    if (fromAccount) await supabase.from("accounts").update({ balance: Number(fromAccount.balance) - amount }).eq("id", payload.account_id);

    if (payload.transfer_to_account_id) {
      const { data: toAccount } = await supabase.from("accounts").select("balance").eq("id", payload.transfer_to_account_id).single();
      if (toAccount) await supabase.from("accounts").update({ balance: Number(toAccount.balance) + amount }).eq("id", payload.transfer_to_account_id);
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
        type: validated.data.type,
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

    // Insert into DB.
    const { error: dbError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        amount: payload.amount,
        type: payload.type,
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

  // Reverse old balance effect
  if (existing.account_id) {
    const { data: oldAcct } = await supabase.from("accounts").select("balance").eq("id", existing.account_id).single();
    if (oldAcct) {
      const reverseAmount = existing.type === "expense"
        ? Number(oldAcct.balance) + Number(existing.amount)
        : Number(oldAcct.balance) - Number(existing.amount);
      await supabase.from("accounts").update({ balance: reverseAmount }).eq("id", existing.account_id);
    }
  }

  // Update the transaction row
  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      amount: newAmount,
      type: newType,
      account_id: newAccountId,
      category_id: newCategoryId,
      date: newDate,
      note: newNote,
    })
    .eq("id", transactionId)
    .eq("user_id", user.id);

  if (updateError) return { error: "Failed to update transaction." };

  // Apply new balance effect
  const { data: newAcct } = await supabase.from("accounts").select("balance").eq("id", newAccountId).single();
  if (newAcct) {
    const newBalance = newType === "expense"
      ? Number(newAcct.balance) - newAmount
      : Number(newAcct.balance) + newAmount;
    await supabase.from("accounts").update({ balance: newBalance }).eq("id", newAccountId);
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
      const amt = Number(sibling.amount);
      if (sibling.type === "expense") {
        const { data: a } = await supabase.from("accounts").select("balance").eq("id", sibling.account_id).single();
        if (a) await supabase.from("accounts").update({ balance: Number(a.balance) + amt }).eq("id", sibling.account_id);
      } else if (sibling.type === "income") {
        const { data: a } = await supabase.from("accounts").select("balance").eq("id", sibling.account_id).single();
        if (a) await supabase.from("accounts").update({ balance: Number(a.balance) - amt }).eq("id", sibling.account_id);
      } else if (sibling.type === "transfer") {
        const { data: from } = await supabase.from("accounts").select("balance").eq("id", sibling.account_id).single();
        if (from) await supabase.from("accounts").update({ balance: Number(from.balance) + amt }).eq("id", sibling.account_id);
        if (sibling.transfer_to_account_id) {
          const { data: to } = await supabase.from("accounts").select("balance").eq("id", sibling.transfer_to_account_id).single();
          if (to) await supabase.from("accounts").update({ balance: Number(to.balance) - amt }).eq("id", sibling.transfer_to_account_id);
        }
      }
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

    // Reverse balance effects (source account)
    if (existing.account_id) {
      const { data: srcAcct } = await supabase
        .from("accounts").select("balance").eq("id", existing.account_id).single();
      if (srcAcct) {
        const reversed =
          existing.type === "expense"
            ? Number(srcAcct.balance) + Number(existing.amount)
            : existing.type === "income"
            ? Number(srcAcct.balance) - Number(existing.amount)
            : Number(srcAcct.balance) + Number(existing.amount);
        await supabase.from("accounts").update({ balance: reversed }).eq("id", existing.account_id);
      }
    }
    if (existing.type === "transfer" && existing.transfer_to_account_id) {
      const { data: dstAcct } = await supabase
        .from("accounts").select("balance").eq("id", existing.transfer_to_account_id).single();
      if (dstAcct) {
        await supabase.from("accounts")
          .update({ balance: Number(dstAcct.balance) - Number(existing.amount) })
          .eq("id", existing.transfer_to_account_id);
      }
    }

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
      type: validated.data.type,
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
 *
 * Flow:
 * 1. Fetch all siblings by split_group_id
 * 2. Reverse every sibling's balance effect
 * 3. Delete all siblings
 * 4. Insert one fresh transaction using the formData values
 * 5. Apply balance update for the new single transaction
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

  // 2. Reverse each sibling's balance
  for (const sib of siblings) {
    const amt = Number(sib.amount);
    if (sib.type === "expense") {
      const { data: a } = await supabase.from("accounts").select("balance").eq("id", sib.account_id).single();
      if (a) await supabase.from("accounts").update({ balance: Number(a.balance) + amt }).eq("id", sib.account_id);
    } else if (sib.type === "income") {
      const { data: a } = await supabase.from("accounts").select("balance").eq("id", sib.account_id).single();
      if (a) await supabase.from("accounts").update({ balance: Number(a.balance) - amt }).eq("id", sib.account_id);
    } else if (sib.type === "transfer") {
      const { data: from } = await supabase.from("accounts").select("balance").eq("id", sib.account_id).single();
      if (from) await supabase.from("accounts").update({ balance: Number(from.balance) + amt }).eq("id", sib.account_id);
      if (sib.transfer_to_account_id) {
        const { data: to } = await supabase.from("accounts").select("balance").eq("id", sib.transfer_to_account_id).single();
        if (to) await supabase.from("accounts").update({ balance: Number(to.balance) - amt }).eq("id", sib.transfer_to_account_id);
      }
    }
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
    type: validated.data.type,
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
