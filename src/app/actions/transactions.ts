"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Form validation schema using Zod
const transactionSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero."),
  type: z.enum(["income", "expense", "transfer"]),
  account_id: z.string().uuid("Please select a valid account."),
  category_id: z.string().optional().nullable(),
  date: z.string().datetime(), // expects ISO string
  note: z.string().optional(),
  transfer_to_account_id: z.string().uuid().optional().nullable(),
});

export async function addTransactionAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to do this." };
  }

  // Extract raw form data
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

  // Update account balance at the application level
  const amount = payload.amount;

  if (payload.type === "expense") {
    const { data: account } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", payload.account_id)
      .single();

    if (account) {
      await supabase
        .from("accounts")
        .update({ balance: Number(account.balance) - amount })
        .eq("id", payload.account_id);
    }
  } else if (payload.type === "income") {
    const { data: account } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", payload.account_id)
      .single();

    if (account) {
      await supabase
        .from("accounts")
        .update({ balance: Number(account.balance) + amount })
        .eq("id", payload.account_id);
    }
  } else if (payload.type === "transfer") {
    // Subtract from source
    const { data: fromAccount } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", payload.account_id)
      .single();

    if (fromAccount) {
      await supabase
        .from("accounts")
        .update({ balance: Number(fromAccount.balance) - amount })
        .eq("id", payload.account_id);
    }

    // Add to destination
    if (payload.transfer_to_account_id) {
      const { data: toAccount } = await supabase
        .from("accounts")
        .select("balance")
        .eq("id", payload.transfer_to_account_id)
        .single();

      if (toAccount) {
        await supabase
          .from("accounts")
          .update({ balance: Number(toAccount.balance) + amount })
          .eq("id", payload.transfer_to_account_id);
      }
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
