"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateProfileAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const displayName = formData.get("display_name") as string;

  if (!displayName || displayName.trim().length < 1) {
    return { error: "Display name is required." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName.trim() })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update profile:", error);
    return { error: "Failed to update profile. Try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");

  return { success: true };
}

export async function exportAllTransactionsAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select(`
      *,
      categories(name),
      accounts!transactions_account_id_fkey(name)
    `)
    .eq("user_id", user.id)
    .order("date", { ascending: false });

  if (error) {
    console.error("Failed to export transactions:", error);
    return { error: "Failed to export data." };
  }

  const headers = ["Date", "Type", "Category", "Note", "Amount", "Account"];
  const rows = (transactions || []).map(txn => [
    new Date(txn.date).toLocaleDateString("en-IN"),
    txn.type,
    txn.categories?.name || "",
    txn.note || "",
    txn.amount?.toString() || "0",
    txn.accounts?.name || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  return { success: true, csv: csvContent };
}

export async function getUserProfileAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, currency_code")
    .eq("id", user.id)
    .single();

  return {
    success: true,
    email: user.email || "",
    displayName: profile?.display_name || user.user_metadata?.full_name || "",
    currencyCode: profile?.currency_code || "INR",
  };
}

export async function updateCurrencyAction(currencyCode: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ currency_code: currencyCode })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update currency:", error);
    return { error: "Failed to update currency." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");

  return { success: true };
}

export async function resetUserAccountAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  try {
    // Delete everything. CASCADEs will help but explicit deletes are safe.
    await supabase.from("transactions").delete().eq("user_id", user.id);
    await supabase.from("accounts").delete().eq("user_id", user.id);
    await supabase.from("budgets").delete().eq("user_id", user.id);
    await supabase.from("categories").delete().eq("user_id", user.id);
    await supabase.from("savings_goals").delete().eq("user_id", user.id);

    // Re-seed default categories
    const defaultCategories = [
      { user_id: user.id, name: 'Income', icon: '💰', color: '#34C759', type: 'income', sort_order: 1 },
      { user_id: user.id, name: 'Food', icon: '🍔', color: '#FF9500', type: 'expense', sort_order: 2 },
      { user_id: user.id, name: 'Transport', icon: '🚗', color: '#636366', type: 'expense', sort_order: 3 },
      { user_id: user.id, name: 'Housing', icon: '🏠', color: '#6C63FF', type: 'expense', sort_order: 4 },
      { user_id: user.id, name: 'Entertainment', icon: '🎬', color: '#FF3B30', type: 'expense', sort_order: 5 },
    ];
    await supabase.from("categories").insert(defaultCategories);

    revalidatePath("/", "layout");

    return { success: true };
  } catch (err: any) {
    console.error("Error resetting account:", err);
    return { error: err.message || "Failed to reset account." };
  }
}
