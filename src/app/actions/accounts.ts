"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const accountSchema = z.object({
  name: z.string().min(1, "Account name is required").max(50),
  type: z.enum(["bank", "cash", "credit_card", "investment", "savings", "contact"]),
  balance: z.number().default(0),
});

export async function addAccountAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to do this." };
  }

  const rawBalance = formData.get("balance") as string;
  const rawData = {
    name: formData.get("name") as string,
    type: formData.get("type") as string,
    balance: rawBalance ? parseFloat(rawBalance) : 0,
  };

  const validated = accountSchema.safeParse(rawData);

  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const payload = validated.data;

  // Insert the account.
  // Note: if the initial balance is > 0, we could automatically create a "Starting Balance" transaction
  // but for now, we just set the raw balance on the account row as requested.
  const { error: dbError } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name: payload.name,
      type: payload.type,
      balance: payload.balance,
      icon: "Landmark", // Default icon mapping 
      color: "var(--accent)" // Default color mapping
    });

  if (dbError) {
    console.error("Database Insert Error:", dbError);
    return { error: "Failed to create account. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/accounts");

  return { success: true };
}

export async function updateAccountAction(accountId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to do this." };
  }

  if (!accountId) {
    return { error: "Invalid account ID." };
  }

  const rawBalance = formData.get("balance") as string;
  const rawData = {
    name: formData.get("name") as string,
    type: formData.get("type") as string,
    balance: rawBalance ? parseFloat(rawBalance) : 0,
  };

  const validated = accountSchema.safeParse(rawData);

  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const payload = validated.data;

  const { error: dbError } = await supabase
    .from("accounts")
    .update({
      name: payload.name,
      type: payload.type,
      balance: payload.balance,
    })
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (dbError) {
    console.error("Database Update Error:", dbError);
    return { error: "Failed to update account. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/accounts");

  return { success: true };
}
