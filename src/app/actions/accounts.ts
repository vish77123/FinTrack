"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const accountSchema = z.object({
  name: z.string().min(1, "Account name is required").max(50),
  type: z.enum(["bank", "cash", "credit_card", "investment", "savings", "contact"]),
  balance: z.number().default(0),
  // Credit card specific fields (optional for non-CC types)
  credit_limit: z.number().min(0).optional().nullable(),
  outstanding_balance: z.number().min(0).optional().nullable(),
  statement_day: z.number().int().min(1).max(28).optional().nullable(),
  due_day: z.number().int().min(1).max(28).optional().nullable(),
  min_payment_pct: z.number().min(1).max(100).optional().nullable(),
  interest_rate_apr: z.number().min(0).max(100).optional().nullable(),
});

function parseCCFields(formData: FormData) {
  const rawCreditLimit = formData.get("credit_limit") as string;
  const rawOutstanding = formData.get("outstanding_balance") as string;
  const rawStatementDay = formData.get("statement_day") as string;
  const rawDueDay = formData.get("due_day") as string;
  const rawMinPaymentPct = formData.get("min_payment_pct") as string;
  const rawInterestRate = formData.get("interest_rate_apr") as string;

  return {
    credit_limit: rawCreditLimit ? parseFloat(rawCreditLimit) : null,
    outstanding_balance: rawOutstanding ? parseFloat(rawOutstanding) : 0,
    statement_day: rawStatementDay ? parseInt(rawStatementDay) : null,
    due_day: rawDueDay ? parseInt(rawDueDay) : null,
    min_payment_pct: rawMinPaymentPct ? parseFloat(rawMinPaymentPct) : 5,
    interest_rate_apr: rawInterestRate ? parseFloat(rawInterestRate) : null,
  };
}

export async function addAccountAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to do this." };
  }

  const type = formData.get("type") as string;
  const rawBalance = formData.get("balance") as string;
  const ccFields = parseCCFields(formData);

  const rawData = {
    name: formData.get("name") as string,
    type,
    balance: rawBalance ? parseFloat(rawBalance) : 0,
    ...(type === "credit_card" ? ccFields : {}),
  };

  const validated = accountSchema.safeParse(rawData);

  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  // Validate: credit_limit required for credit cards
  if (type === "credit_card" && (!ccFields.credit_limit || ccFields.credit_limit <= 0)) {
    return { error: "Credit limit is required for credit card accounts." };
  }

  const payload = validated.data;

  const insertPayload: any = {
    user_id: user.id,
    name: payload.name,
    type: payload.type,
    balance: payload.type === "credit_card" ? 0 : payload.balance,
    icon: payload.type === "contact" ? "User" : payload.type === "credit_card" ? "CreditCard" : "Landmark",
    color: payload.type === "contact" ? "var(--warning)" : payload.type === "credit_card" ? "var(--danger)" : "var(--accent)",
  };

  // Attach CC-specific fields
  if (payload.type === "credit_card") {
    insertPayload.credit_limit = payload.credit_limit;
    insertPayload.outstanding_balance = payload.outstanding_balance ?? 0;
    insertPayload.statement_day = payload.statement_day;
    insertPayload.due_day = payload.due_day;
    insertPayload.min_payment_pct = payload.min_payment_pct ?? 5;
    insertPayload.interest_rate_apr = payload.interest_rate_apr;
  }

  const { error: dbError } = await supabase
    .from("accounts")
    .insert(insertPayload);

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

  const type = formData.get("type") as string;
  const rawBalance = formData.get("balance") as string;
  const ccFields = parseCCFields(formData);

  const rawData = {
    name: formData.get("name") as string,
    type,
    balance: rawBalance ? parseFloat(rawBalance) : 0,
    ...(type === "credit_card" ? ccFields : {}),
  };

  const validated = accountSchema.safeParse(rawData);

  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const payload = validated.data;

  const updatePayload: any = {
    name: payload.name,
    type: payload.type,
    balance: payload.type === "credit_card" ? 0 : payload.balance,
  };

  if (payload.type === "credit_card") {
    updatePayload.credit_limit = payload.credit_limit;
    updatePayload.outstanding_balance = payload.outstanding_balance ?? 0;
    updatePayload.statement_day = payload.statement_day;
    updatePayload.due_day = payload.due_day;
    updatePayload.min_payment_pct = payload.min_payment_pct ?? 5;
    updatePayload.interest_rate_apr = payload.interest_rate_apr;
  } else {
    // Clear CC fields for non-CC types
    updatePayload.credit_limit = null;
    updatePayload.outstanding_balance = null;
    updatePayload.statement_day = null;
    updatePayload.due_day = null;
    updatePayload.min_payment_pct = null;
    updatePayload.interest_rate_apr = null;
  }

  const { error: dbError } = await supabase
    .from("accounts")
    .update(updatePayload)
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

export async function archiveAccountAction(accountId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to do this." };
  }

  if (!accountId) {
    return { error: "Invalid account ID." };
  }

  const { error: dbError } = await supabase
    .from("accounts")
    .update({ is_archived: true })
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (dbError) {
    console.error("Database Archive Error:", dbError);
    return { error: "Failed to archive account. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/accounts");

  return { success: true };
}
