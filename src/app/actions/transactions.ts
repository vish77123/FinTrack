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
