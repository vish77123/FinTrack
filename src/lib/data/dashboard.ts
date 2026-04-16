import { createClient } from "@/lib/supabase/server";
import { mockData } from "@/lib/mockData";

// ─────────────────────────────────────────────────────────────
// CREDIT CARD BILLING CYCLE HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Returns the start date of the CURRENT UNBILLED cycle.
 * Cycle start = day after the most recent statement date.
 *
 * Uses >= so that ON the statement day itself, the previous
 * cycle is considered closed (billed) and a new cycle begins.
 *
 * statement_day=15, today=Apr 15 → cycle started Apr 16 (statement just closed)
 * statement_day=15, today=Apr 16 → cycle started Apr 16
 * statement_day=15, today=Apr 14 → cycle started Mar 16
 */
function getCycleStartDate(statementDay: number | null): Date | null {
  if (!statementDay) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today.getDate() >= statementDay) {
    return new Date(today.getFullYear(), today.getMonth(), statementDay + 1);
  }
  return new Date(today.getFullYear(), today.getMonth() - 1, statementDay + 1);
}


/**
 * Enriches a CC account with all computed display fields.
 * Requires allTransactions to compute currentCycleSpent.
 */
function enrichCCAccount(acc: any, allTransactions: any[] = []) {
  if (acc.type !== "credit_card") return acc;

  const outstanding     = Number(acc.outstanding_balance) || 0;
  const limit           = Number(acc.credit_limit) || 0;
  const availableCredit = limit > 0 ? Math.max(0, limit - outstanding) : null;
  const utilizationPct  = limit > 0 ? Math.round(((outstanding / limit) * 100) * 10) / 10 : null;

  // ── Due date: simply find the next calendar occurrence of due_day ───
  // The due date is independent of billing cycle.
  // "When is my next payment due?" = the next due_day on the calendar.
  let daysUntilDue: number | null = null;
  let nextDueDateStr: string | null = null;

  if (outstanding > 0 && acc.due_day) {
    const dueDay = Number(acc.due_day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueThisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay);
    const nextDue = dueThisMonth >= today
      ? dueThisMonth
      : new Date(today.getFullYear(), today.getMonth() + 1, dueDay);

    daysUntilDue = Math.ceil((nextDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    nextDueDateStr = nextDue.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  }

  // ── Billing breakdown: Current Due vs Unbilled ────────────
  // unbilled     = charges since the last statement closed (new cycle)
  // currentDue   = outstanding - unbilled (what’s on the last statement)
  // currentDuePaid = true when currentDue <= 0 (user paid the bill)
  const cycleStart = getCycleStartDate(acc.statement_day ? Number(acc.statement_day) : null);

  let unbilled = 0;
  let currentDue = outstanding;
  let currentDuePaid = false;

  if (cycleStart && allTransactions.length > 0) {
    unbilled = allTransactions
      .filter(t =>
        t.account_id === acc.id &&
        t.type === "expense" &&
        new Date(t.date) >= cycleStart
      )
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    currentDue = Math.max(0, outstanding - unbilled);
    currentDuePaid = outstanding > 0 && currentDue <= 0;
  }

  const minPaymentDue = currentDue > 0
    ? Math.round(currentDue * ((Number(acc.min_payment_pct) || 5) / 100) * 100) / 100
    : 0;

  return {
    ...acc,
    outstanding_balance: outstanding,
    credit_limit: limit,
    availableCredit,
    utilizationPct,
    daysUntilDue,
    nextDueDateStr,
    minPaymentDue,
    unbilled,             // charges since last statement
    currentDue,           // billed charges awaiting payment
    currentDuePaid,       // true when bill has been paid
    cycleStartDate: cycleStart ? cycleStart.toISOString() : null,
  };
}

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
    // Run all queries in parallel for faster data loading
    const [
      { data: accountsRaw },
      { data: transactionsRaw },
      { data: goalsRaw },
      { data: categoriesRaw }
    ] = await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, type, balance, icon, color, is_archived, credit_limit, outstanding_balance, statement_day, due_day, min_payment_pct, interest_rate_apr")
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("created_at", { ascending: true }),
      supabase
        .from("transactions")
        .select(`
          *,
          categories(name, color, icon),
          accounts!transactions_account_id_fkey(name, type),
          transfer_account:accounts!transactions_transfer_to_account_id_fkey(name, type)
        `)
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(50),
      supabase
        .from("savings_goals")
        .select("*")
        .eq("user_id", user.id),
      supabase
        .from("categories")
        .select("id, name, icon, color, type, sort_order")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true }),
    ]);

    // 5. Fallback if user's account is absolutely brand new (no data at all)
    if (!accountsRaw || accountsRaw.length === 0) {
       return {
         ...mockData,
         netWorth: 0,
         todaySpent: 0,
         income: 0,
         expenses: 0,
         savings: 0,
         totalCCDebt: 0,
         ccCardCount: 0,
         accounts: [],
         categories: (categoriesRaw || []).filter((c: any) => c.sort_order !== -9999),
         recentTransactions: [],
         savingsGoals: [],
         spendingData: []
       };
    }

    // --- DATA TRANSFORMATION LOGIC ---
    
    // A. Net Worth Calculation — P0 fix: CC outstanding is a liability
    const netWorth = accountsRaw.reduce((sum, acc) => {
      if (acc.type === "credit_card") {
        // Subtract outstanding debt from net worth
        return sum - (Number(acc.outstanding_balance) || 0);
      }
      // All other account types are assets
      return sum + (Number(acc.balance) || 0);
    }, 0);

    // A0. Total CC Debt & count (for SummaryGrid card)
    const ccAccounts = accountsRaw.filter(acc => acc.type === "credit_card");
    const totalCCDebt = ccAccounts.reduce((sum, acc) => sum + (Number(acc.outstanding_balance) || 0), 0);
    const ccCardCount = ccAccounts.length;

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
          note: txn.note || '',
          category: txn.categories ? txn.categories.name : 'General',
          amount: Number(txn.amount),
          type: txn.type,
          account: txn.accounts ? txn.accounts.name : 'Account',
          account_id: txn.account_id,
          category_id: txn.category_id,
          transfer_to_account_id: txn.transfer_to_account_id,
          transfer_account_name: txn.transfer_account ? (txn.transfer_account as any).name : null,
          transfer_account_type: txn.transfer_account ? (txn.transfer_account as any).type : null,
          icon: txn.categories?.icon,
          color: txn.categories?.color,
          split_group_id: txn.split_group_id,
          original_synced_name: txn.original_synced_name
        });
      });

      groupsMap.forEach(value => groupedTxns.push(value));
    }

    // C. Re-map accounts — enrich CC accounts with computed fields
    const formattedAccounts = accountsRaw.map(acc => enrichCCAccount({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      balance: Number(acc.balance),
      icon: acc.icon,
      color: acc.color,
      credit_limit: acc.credit_limit,
      outstanding_balance: acc.outstanding_balance,
      statement_day: acc.statement_day,
      due_day: acc.due_day,
      min_payment_pct: acc.min_payment_pct,
      interest_rate_apr: acc.interest_rate_apr,
    }, transactionsRaw || []));

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
      totalCCDebt,
      ccCardCount,
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
      ...mockData, accounts: [], recentTransactions: [], savingsGoals: [], spendingData: [],
      totalCCDebt: 0, ccCardCount: 0,
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
      id, amount, type, date, note, account_id, category_id, transfer_to_account_id, split_group_id, original_synced_name,
      categories(name, color, icon),
      accounts!transactions_account_id_fkey(name, type),
      transfer_account:accounts!transactions_transfer_to_account_id_fkey(name, type)
    `)
    .eq("user_id", user.id)
    .order("date", { ascending: false });

  const transactions = (txns || []).map(txn => ({
    id: txn.id,
    date: txn.date,
    merchant: txn.note || (txn.categories ? (txn.categories as any).name : "Transaction"),
    note: txn.note || '',
    category: txn.categories ? (txn.categories as any).name : "General",
    amount: Number(txn.amount),
    type: txn.type,
    account: txn.accounts ? (txn.accounts as any).name : "Account",
    account_id: txn.account_id,
    category_id: txn.category_id,
    transfer_to_account_id: txn.transfer_to_account_id,
    transfer_account_name: txn.transfer_account ? (txn.transfer_account as any).name : null,
    transfer_account_type: txn.transfer_account ? (txn.transfer_account as any).type : null,
    icon: (txn.categories as any)?.icon,
    color: (txn.categories as any)?.color,
    split_group_id: txn.split_group_id,
    original_synced_name: txn.original_synced_name
  }));

  return { transactions, currency: "₹" };
}
