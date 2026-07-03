import { createClient } from "@/lib/supabase/server";
import { mockData } from "@/lib/mockData";
import { CURRENCY_SYMBOL } from "@/lib/currency";

// How far back the dashboard/transactions row fetch reaches. Everything the
// dashboard computes from raw rows (recent list, CC billing cycles ≤ ~1 month)
// fits well inside this window; month/today totals and the spending donut come
// from the get_dashboard_aggregates RPC so they stay exact regardless of it.
const TXN_WINDOW_DAYS = 90;
// Hard row cap inside the window — protects serverless memory against
// pathological ingest volume. Newest rows win (query is date-descending).
const TXN_FETCH_LIMIT = 1000;

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

  // Raw value preserves overpayment credit balances (stored as negative outstanding so
  // that reversal is symmetric). Clamped value is what we show in the UI.
  const rawOutstanding  = Number(acc.outstanding_balance) || 0;
  const outstanding     = Math.max(0, rawOutstanding);
  const limit           = Number(acc.credit_limit) || 0;
  const availableCredit = limit > 0 ? Math.max(0, limit - outstanding) : null;
  const utilizationPct  = limit > 0 ? Math.round(((outstanding / limit) * 100) * 10) / 10 : null;

  // ── Due date: next calendar occurrence of due_day ───────────────
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
  // Standard CC model:
  //   - Charges between statements accumulate as `unbilled`.
  //   - On statement_day, that snapshot becomes `currentDue` (frozen until paid).
  //   - Post-statement charges go into the next cycle's `unbilled`.
  //   - Payments reduce `currentDue` first; any excess overflows to `unbilled`.
  //
  // We don't store a statement-balance snapshot, so we reconstruct it from the
  // accounting identity:
  //   outstanding(now) = statementBalance + cycleExpenses − cycleCredits − cyclePayments
  const cycleStart = getCycleStartDate(acc.statement_day ? Number(acc.statement_day) : null);

  let unbilled = 0;
  let currentDue = outstanding;
  let currentDuePaid = false;

  if (cycleStart && allTransactions.length > 0) {
    const inCycle = (t: any) => new Date(t.date) >= cycleStart!;

    // Charges = expenses + transfers FROM this CC (e.g. RAZORPAY GOV, flight splits).
    // Both types increase outstanding_balance in applyBalanceUpdate, so both must be
    // counted here to keep the statementBalance identity correct.
    const cycleExpenses = allTransactions
      .filter(t => t.account_id === acc.id && (t.type === "expense" || t.type === "transfer") && inCycle(t))
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    // Refunds/cashback posted to the CC (income type with the CC as account_id).
    const cycleCredits = allTransactions
      .filter(t => t.account_id === acc.id && t.type === "income" && inCycle(t))
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    // Bill payments — transfers TO this CC from another account.
    const cyclePayments = allTransactions
      .filter(t => t.transfer_to_account_id === acc.id && t.type === "transfer" && inCycle(t))
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const statementBalance = Math.max(
      0,
      rawOutstanding - cycleExpenses + cycleCredits + cyclePayments
    );

    const newCharges     = Math.max(0, cycleExpenses - cycleCredits);
    const paymentsExcess = Math.max(0, cyclePayments - statementBalance);

    currentDue     = Math.max(0, statementBalance - cyclePayments);
    unbilled       = Math.max(0, newCharges - paymentsExcess);
    currentDuePaid = statementBalance > 0 && cyclePayments >= statementBalance;
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
    // Time boundaries shared by the bounded row fetch, the SQL aggregates,
    // and the JS fallback below. Same server-local-midnight semantics the
    // old in-JS computation used.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const windowStart = new Date(todayStart);
    windowStart.setDate(windowStart.getDate() - TXN_WINDOW_DAYS);

    // Run all queries in parallel for faster data loading
    const [
      { data: accountsRaw },
      { data: transactionsRaw },
      { data: goalsRaw },
      { data: categoriesRaw },
      { data: aggregates, error: aggregatesError },
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
        .gte("date", windowStart.toISOString())
        .order("date", { ascending: false })
        .limit(TXN_FETCH_LIMIT),
      supabase
        .from("savings_goals")
        .select("*")
        .eq("user_id", user.id),
      supabase
        .from("categories")
        .select("id, name, icon, color, type, sort_order")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true }),
      // Month/today totals + category spending, aggregated in Postgres so
      // they stay exact no matter how the row fetch above is bounded.
      supabase.rpc("get_dashboard_aggregates", {
        p_month_start: monthStart.toISOString(),
        p_day_start: todayStart.toISOString(),
        p_day_end: todayEnd.toISOString(),
      }),
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
        // Clamp at 0: overpayment credit balances (negative outstanding) should not
        // inflate net worth — they represent a pending refund, not a real asset.
        return sum - Math.max(0, Number(acc.outstanding_balance) || 0);
      }
      return sum + (Number(acc.balance) || 0);
    }, 0);

    // A0. Total CC Debt & count (for SummaryGrid card)
    const ccAccounts = accountsRaw.filter(acc => acc.type === "credit_card");
    const totalCCDebt = ccAccounts.reduce((sum, acc) => sum + Math.max(0, Number(acc.outstanding_balance) || 0), 0);
    const ccCardCount = ccAccounts.length;

    // A1/A2. Month income/expenses, today's spend, and category spending —
    // computed in Postgres (get_dashboard_aggregates). JS fallback below runs
    // only if the RPC is missing (migration 024 not applied yet); the bounded
    // window fully contains month-to-date, so the fallback is equally exact.
    let totalIncome = 0;
    let totalExpenses = 0;
    let todaySpent = 0;
    let formattedSpending: { name: string; value: number; color: string }[] = [];

    if (!aggregatesError && aggregates) {
      totalIncome = Number(aggregates.income) || 0;
      totalExpenses = Number(aggregates.expenses) || 0;
      todaySpent = Number(aggregates.today_spent) || 0;
      const spendingRows: { name: string; value: number | string; color: string | null }[] =
        aggregates.spending || [];
      formattedSpending = spendingRows.map(s => ({
        name: s.name,
        value: Number(s.value) || 0,
        color: s.color || "#888",
      }));
    } else {
      console.error(
        "[DASHBOARD] get_dashboard_aggregates RPC failed (is migration 024 applied?):",
        aggregatesError?.message
      );
      const spendingMap = new Map<string, { name: string; value: number; color: string }>();
      (transactionsRaw || []).forEach(txn => {
        const txnDate = new Date(txn.date);
        if (txnDate >= monthStart) {
          if (txn.type === 'income') totalIncome += Number(txn.amount);
          if (txn.type === 'expense') totalExpenses += Number(txn.amount);
          if (txn.type === 'expense' && txn.categories) {
            const cat = txn.categories.name;
            if (!spendingMap.has(cat)) {
              spendingMap.set(cat, { name: cat, value: 0, color: txn.categories.color || "#888" });
            }
            spendingMap.get(cat)!.value += Number(txn.amount);
          }
        }

        const justDate = new Date(txn.date);
        justDate.setHours(0, 0, 0, 0);
        if (justDate.getTime() === todayStart.getTime() && txn.type === 'expense') {
          todaySpent += Number(txn.amount);
        }
      });
      formattedSpending = Array.from(spendingMap.values()).sort((a, b) => b.value - a.value);
    }
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

    // Return the perfectly molded Live Data matching the required UI interface!
    return {
      currency: CURRENCY_SYMBOL,
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
      spendingData: formattedSpending
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
 * Fetch transactions for the Reports page, bounded to the widest range the
 * UI can display: ReportsView's filters top out at "This Year" / a 365-day
 * custom range, and its bar chart looks back 6 months — all inside one year.
 * Previously this fetched the user's entire history, which grows without
 * limit under email/SMS auto-ingest.
 */
export async function getReportsData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const isPlaceholder = supabaseUrl.includes("placeholder");

  if (isPlaceholder) {
    return { transactions: [], currency: CURRENCY_SYMBOL };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const reportsWindowStart = new Date();
  reportsWindowStart.setHours(0, 0, 0, 0);
  reportsWindowStart.setDate(reportsWindowStart.getDate() - 366);

  const { data: txns } = await supabase
    .from("transactions")
    .select(`
      id, amount, type, date, note, account_id, category_id, transfer_to_account_id, split_group_id, original_synced_name,
      categories(name, color, icon),
      accounts!transactions_account_id_fkey(name, type),
      transfer_account:accounts!transactions_transfer_to_account_id_fkey(name, type)
    `)
    .eq("user_id", user.id)
    .gte("date", reportsWindowStart.toISOString())
    .order("date", { ascending: false })
    .limit(10000);

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

  return { transactions, currency: CURRENCY_SYMBOL };
}
