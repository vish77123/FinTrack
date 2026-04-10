"use client";

import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from "recharts";
import styles from "./reports.module.css";

interface Transaction {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  account: string;
  icon?: string;
  color?: string;
}

interface ReportsViewProps {
  transactions: Transaction[];
  currency: string;
}

type TimeFilter = "This Month" | "Last Month" | "This Year" | "Custom";

// Helper: get date range from filter
function getDateRange(filter: TimeFilter): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (filter) {
    case "This Month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end };
    }
    case "Last Month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      lastDay.setHours(23, 59, 59, 999);
      return { start, end: lastDay };
    }
    case "This Year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end };
    }
    case "Custom":
    default:
      // Default: show all data (last 365 days)
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      return { start, end };
  }
}

export default function ReportsView({ transactions, currency }: ReportsViewProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("This Month");

  const formatCurrency = (amount: number) => {
    if (amount >= 1000) return `${currency}${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}K`;
    return `${currency}${amount.toLocaleString("en-IN")}`;
  };
  
  const formatCurrencyFull = (amount: number) => {
    return `${currency}${amount.toLocaleString("en-IN")}`;
  };

  // Filter transactions by time range
  const filteredTxns = useMemo(() => {
    const { start, end } = getDateRange(timeFilter);
    return transactions.filter(txn => {
      const d = new Date(txn.date);
      return d >= start && d <= end;
    });
  }, [transactions, timeFilter]);

  // ---- INCOME vs EXPENSES (last 6 months bar) ----
  const incomeExpenseData = useMemo(() => {
    const now = new Date();
    const months: { name: string; income: number; expense: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = d.toLocaleDateString("en-US", { month: "short" });

      let income = 0;
      let expense = 0;
      transactions.forEach(txn => {
        const txnDate = new Date(txn.date);
        if (txnDate >= d && txnDate <= monthEnd) {
          if (txn.type === "income") income += txn.amount;
          if (txn.type === "expense") expense += txn.amount;
        }
      });
      months.push({ name: label, income, expense });
    }
    return months;
  }, [transactions]);

  // ---- SPENDING BY CATEGORY (donut) ----
  const spendingByCategory = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string; icon?: string }>();
    filteredTxns.forEach(txn => {
      if (txn.type === "expense") {
        const cat = txn.category || "Others";
        if (!map.has(cat)) {
          map.set(cat, { name: cat, value: 0, color: txn.color || "#8E8E93", icon: txn.icon });
        }
        map.get(cat)!.value += txn.amount;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [filteredTxns]);

  const totalSpending = spendingByCategory.reduce((s, c) => s + c.value, 0);
  const maxCategoryValue = spendingByCategory.length > 0 ? spendingByCategory[0].value : 1;

  // ---- DAILY SPENDING TREND ----
  const dailySpendingData = useMemo(() => {
    const { start, end } = getDateRange(timeFilter);
    const dayMap = new Map<string, number>();

    // Initialize all days in range
    const current = new Date(start);
    while (current <= end) {
      const key = current.getDate().toString();
      dayMap.set(key, 0);
      current.setDate(current.getDate() + 1);
    }

    filteredTxns.forEach(txn => {
      if (txn.type === "expense") {
        const d = new Date(txn.date);
        const key = d.getDate().toString();
        dayMap.set(key, (dayMap.get(key) || 0) + txn.amount);
      }
    });

    return Array.from(dayMap.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredTxns, timeFilter]);

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Reports</h1>
          <p className={styles.pageSubtitle}>Visual insights into your financial habits</p>
        </div>
        
        <div className={styles.filterPills}>
          {(["This Month", "Last Month", "This Year", "Custom"] as TimeFilter[]).map(f => (
            <button 
              key={f}
              className={`${styles.pillBtn} ${timeFilter === f ? styles.active : ""}`}
              onClick={() => setTimeFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* TOP WIDE CHART - Income vs Expense */}
      <div className={styles.chartCard}>
        <h3 className={styles.cardTitle}>Income vs. Expenses — Last 6 Months</h3>
        <div style={{ width: "100%", height: "220px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={incomeExpenseData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--danger)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-tertiary)" }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} tickFormatter={(val) => formatCurrency(val)} />
              <RechartsTooltip 
                contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "var(--shadow-sm)", fontSize: "13px" }}
                formatter={(value: any) => formatCurrencyFull(Number(value))}
              />
              <Area type="monotone" dataKey="income" stroke="var(--success)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorIncome)" />
              <Area type="monotone" dataKey="expense" stroke="var(--danger)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorExpense)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <div style={{ display: "flex", gap: "24px", marginTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)" }}></span> Income
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--danger)" }}></span> Expenses
          </div>
        </div>
      </div>

      {/* BOTTOM SPLIT */}
      <div className={styles.splitGrid}>
        
        {/* DONUT: Spending by Category */}
        <div className={styles.chartCard}>
          <h3 className={styles.cardTitle}>Spending by Category</h3>
          <div className={styles.donutContainer}>
            <div className={styles.donutWrapper}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={spendingByCategory.length > 0 ? spendingByCategory : [{ name: "No data", value: 1, color: "#e5e5e5" }]}
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {(spendingByCategory.length > 0 ? spendingByCategory : [{ name: "No data", value: 1, color: "#e5e5e5" }]).map((entry: any, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "var(--shadow-lg)", fontSize: "13px" }}
                    formatter={(value: any) => formatCurrencyFull(Number(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
              {totalSpending > 0 && (
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-primary)" }}>{formatCurrencyFull(totalSpending)}</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Total spent</div>
              </div>
              )}
            </div>

            <div className={styles.donutLegend}>
              {spendingByCategory.map((item: any, index) => (
                <div key={index} className={styles.legendRow}>
                  <div className={styles.legendLabel}>
                    <div className={styles.legendColor} style={{ backgroundColor: item.color }}></div>
                    {item.name}
                  </div>
                  <div className={styles.legendAmount}>{formatCurrencyFull(item.value)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* LINE: Daily Spending Trend */}
        <div className={styles.chartCard}>
          <h3 className={styles.cardTitle}>Daily Spending Trend</h3>
          <div style={{ width: "100%", height: "220px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySpendingData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} tickFormatter={(val) => formatCurrency(val)} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "var(--shadow-sm)", fontSize: "13px" }}
                  formatter={(value: any) => formatCurrencyFull(Number(value))}
                />
                <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* TOP SPENDING CATEGORIES - Horizontal Bars */}
      {spendingByCategory.length > 0 && (
        <div className={styles.chartCard}>
          <h3 className={styles.cardTitle}>Top Spending Categories</h3>
          <div className={styles.barList}>
            {spendingByCategory.slice(0, 5).map((cat, index) => (
              <div key={index} className={styles.barRow}>
                <div className={styles.barLabel}>
                  <span className={styles.barIcon}>{cat.icon || "📦"}</span>
                  <span className={styles.barName}>{cat.name}</span>
                </div>
                <div className={styles.barTrack}>
                  <div 
                    className={styles.barFill}
                    style={{ 
                      width: `${(cat.value / maxCategoryValue) * 100}%`,
                      background: cat.color 
                    }}
                  >
                    <span className={styles.barValue}>{formatCurrencyFull(cat.value)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
