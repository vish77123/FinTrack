import { createClient } from "@/lib/supabase/server";
import { mockData } from "@/lib/mockData";

export async function getDashboardData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const isPlaceholder = supabaseUrl.includes("placeholder");

  // Fallback if environment is not set up yet
  if (isPlaceholder) {
    return mockData;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  try {
    // 1. Fetch Accounts
    const { data: accountsRaw } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("created_at", { ascending: true });

    // 2. Fetch Transactions (with Joined Categories & Accounts)
    const { data: transactionsRaw } = await supabase
      .from("transactions")
      .select(`
        *,
        categories(name, color, icon),
        accounts!transactions_account_id_fkey(name)
      `)
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(50); // Fetch a healthy chunk for recent views

    // 3. Fetch Savings Goals
    const { data: goalsRaw } = await supabase
      .from("savings_goals")
      .select("*")
      .eq("user_id", user.id);

    // 4. Fetch Categories for use in Transaction modal
    const { data: categoriesRaw } = await supabase
      .from("categories")
      .select("id, name, icon, color, type, sort_order")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true });

    // 5. Fallback if user's account is absolutely brand new (no data at all)
    if (!accountsRaw || accountsRaw.length === 0) {
       return {
         ...mockData,
         netWorth: 0,
         income: 0,
         expenses: 0,
         savings: 0,
         accounts: [],
         categories: (categoriesRaw || []).filter((c: any) => c.sort_order !== -9999),
         recentTransactions: [],
         savingsGoals: [],
         spendingData: []
       };
    }

    // --- DATA TRANSFORMATION LOGIC ---
    
    // A. Net Worth Calculation
    const netWorth = accountsRaw.reduce((sum, acc) => sum + Number(acc.balance), 0);

    // A1. Today's Spent Calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let todaySpent = 0;

    // A2. Calculate Income, Expenses, and Savings for the current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let totalIncome = 0;
    let totalExpenses = 0;
    (transactionsRaw || []).forEach(txn => {
      const txnDate = new Date(txn.date);
      if (txnDate >= monthStart) {
        if (txn.type === 'income') totalIncome += Number(txn.amount);
        if (txn.type === 'expense') totalExpenses += Number(txn.amount);
      }
      
      const justDate = new Date(txn.date);
      justDate.setHours(0, 0, 0, 0);
      if (justDate.getTime() === today.getTime() && txn.type === 'expense') {
        todaySpent += Number(txn.amount);
      }
    });
    const totalSavings = totalIncome - totalExpenses;

    // B. Group Transactions by Date (Building the 'recentTransactions' array shape)
    const groupedTxns: any[] = [];
    if (transactionsRaw && transactionsRaw.length > 0) {
      const groupsMap = new Map();

      transactionsRaw.forEach(txn => {
        // Format the postgres date to a human readable label (e.g. "Today, April 9" or "April 8")
        const dateObj = new Date(txn.date);
        const dayLabel = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        
        if (!groupsMap.has(dayLabel)) {
          groupsMap.set(dayLabel, {
            id: `group_${dayLabel}`,
            dateLabel: dayLabel,
            dailyIncome: 0,
            dailyExpense: 0,
            transactions: []
          });
        }

        const group = groupsMap.get(dayLabel);
        if (txn.type === 'income') group.dailyIncome += Number(txn.amount);
        if (txn.type === 'expense') group.dailyExpense += Number(txn.amount);
        
        group.transactions.push({
          id: txn.id,
          date: txn.date,
          merchant: txn.note || (txn.categories ? txn.categories.name : 'Transaction'),
          category: txn.categories ? txn.categories.name : 'General',
          amount: Number(txn.amount),
          type: txn.type,
          account: txn.accounts ? txn.accounts.name : 'Account',
          icon: txn.categories?.icon,
          color: txn.categories?.color
        });
      });

      groupsMap.forEach(value => groupedTxns.push(value));
    }

    // C. Re-map accounts
    const formattedAccounts = accountsRaw.map(acc => ({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      balance: Number(acc.balance)
    }));

    // D. Re-map Savings goals
    const formattedGoals = (goalsRaw || []).map(g => ({
      id: g.id,
      name: g.name,
      target: Number(g.target_amount),
      saved: Number(g.current_amount),
      targetDate: g.target_date
    }));

    // E. (Optional/Future) Call the RPC for precise category calculations. 
    // Right now, we construct a generic spending array from the raw transactions for Donut Charts
    const spendingMap = new Map();
    (transactionsRaw || []).forEach(txn => {
      if (txn.type === 'expense' && txn.categories) {
        const cat = txn.categories.name;
        if (!spendingMap.has(cat)) {
          spendingMap.set(cat, { name: cat, value: 0, color: txn.categories.color || "#888" });
        }
        spendingMap.get(cat).value += Number(txn.amount);
      }
    });
    const formattedSpending = Array.from(spendingMap.values()).sort((a,b) => b.value - a.value);

    // Return the perfectly molded Live Data matching the required UI interface!
    return {
      currency: "₹",
      netWorth,
      todaySpent,
      income: totalIncome,
      expenses: totalExpenses,
      savings: totalSavings,
      pendingTransactions: mockData.pendingTransactions,
      accounts: formattedAccounts,
      categories: (categoriesRaw || []).filter((c: any) => c.sort_order !== -9999),
      recentTransactions: groupedTxns,
      savingsGoals: formattedGoals,
      spendingData: formattedSpending.length > 0 ? formattedSpending : []
    };

  } catch (error) {
    console.error("Error formatting live dashboard data:", error);
    // If strict array parsing fails, don't crash the app, return empty shapes.
    return {
      ...mockData, accounts: [], recentTransactions: [], savingsGoals: [], spendingData: []
    };
  }
}

/**
 * Fetch ALL transactions for the Reports page (no limit).
 * Returns a flat array of transaction objects with category/account metadata.
 */
export async function getReportsData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const isPlaceholder = supabaseUrl.includes("placeholder");

  if (isPlaceholder) {
    return { transactions: [], currency: "₹" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: txns } = await supabase
    .from("transactions")
    .select(`
      id, amount, type, date, note,
      categories(name, color, icon),
      accounts!transactions_account_id_fkey(name)
    `)
    .eq("user_id", user.id)
    .order("date", { ascending: false });

  const transactions = (txns || []).map(txn => ({
    id: txn.id,
    date: txn.date,
    merchant: txn.note || (txn.categories ? (txn.categories as any).name : "Transaction"),
    category: txn.categories ? (txn.categories as any).name : "General",
    amount: Number(txn.amount),
    type: txn.type,
    account: txn.accounts ? (txn.accounts as any).name : "Account",
    icon: (txn.categories as any)?.icon,
    color: (txn.categories as any)?.color,
  }));

  return { transactions, currency: "₹" };
}
