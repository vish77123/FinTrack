"use server";

import { createClient } from "@/lib/supabase/server";

export async function getBudgetsData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  // Fetch budgets with category info
  const { data: budgets } = await supabase
    .from("budgets")
    .select(`
      id, amount_limit, period, start_date,
      categories(id, name, icon, color, type)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  // Fetch all transactions for the current period to calculate spent amounts
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const { data: transactions } = await supabase
    .from("transactions")
    .select("amount, type, category_id, date")
    .eq("user_id", user.id)
    .eq("type", "expense")
    .gte("date", monthStart);

  // Also fetch weekly transactions
  const { data: weeklyTransactions } = await supabase
    .from("transactions")
    .select("amount, type, category_id, date")
    .eq("user_id", user.id)
    .eq("type", "expense")
    .gte("date", weekStart.toISOString());

  // Build spent-per-category maps
  const monthlySpentMap = new Map<string, number>();
  (transactions || []).forEach(txn => {
    if (txn.category_id) {
      monthlySpentMap.set(txn.category_id, (monthlySpentMap.get(txn.category_id) || 0) + Number(txn.amount));
    }
  });

  const weeklySpentMap = new Map<string, number>();
  (weeklyTransactions || []).forEach(txn => {
    if (txn.category_id) {
      weeklySpentMap.set(txn.category_id, (weeklySpentMap.get(txn.category_id) || 0) + Number(txn.amount));
    }
  });

  // Calculate days remaining in month
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - now.getDate();

  const formattedBudgets = (budgets || []).map(b => {
    const cat = b.categories as any;
    const categoryId = cat?.id || "";
    const monthlySpent = monthlySpentMap.get(categoryId) || 0;
    const weeklySpent = weeklySpentMap.get(categoryId) || 0;

    return {
      id: b.id,
      categoryId,
      categoryName: cat?.name || "Unknown",
      categoryIcon: cat?.icon || "📦",
      categoryColor: cat?.color || "#8E8E93",
      limit: Number(b.amount_limit),
      period: b.period,
      monthlySpent,
      weeklySpent,
    };
  });

  // Fetch categories for the Add Budget modal
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, icon, color, type, sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  const activeCategories = (categories || []).filter((c: any) => c.sort_order !== -9999 && c.type === "expense");

  return {
    budgets: formattedBudgets,
    categories: activeCategories,
    currency: "₹",
    daysLeft,
  };
}
