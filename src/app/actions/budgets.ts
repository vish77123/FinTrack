"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addBudgetAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const categoryId = formData.get("category_id") as string;
  const amountLimit = parseFloat(formData.get("amount_limit") as string);
  const period = (formData.get("period") as string) || "monthly";

  if (!categoryId) return { error: "Please select a category." };
  if (!amountLimit || amountLimit <= 0) return { error: "Please enter a valid budget limit." };

  // Check if budget already exists for this category + period
  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("user_id", user.id)
    .eq("category_id", categoryId)
    .eq("period", period)
    .maybeSingle();

  if (existing) {
    return { error: "A budget already exists for this category. Delete it first to create a new one." };
  }

  const { error: dbError } = await supabase
    .from("budgets")
    .insert({
      user_id: user.id,
      category_id: categoryId,
      amount_limit: amountLimit,
      period,
      start_date: new Date().toISOString().split("T")[0],
    });

  if (dbError) {
    console.error("Add budget error:", dbError);
    return { error: "Failed to create budget." };
  }

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteBudgetAction(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error: dbError } = await supabase
    .from("budgets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (dbError) {
    console.error("Delete budget error:", dbError);
    return { error: "Failed to delete budget." };
  }

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  return { success: true };
}
