"use client";

import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import styles from "./reports.module.css";

interface ReportsViewProps {
  spendingData: any[];
  currency: string;
}

// Mocking trend data for the full width wide chart since we don't have historical months in our DB yet
const trendData = [
  { name: 'Nov', income: 4000, expense: 2400 },
  { name: 'Dec', income: 3000, expense: 1398 },
  { name: 'Jan', income: 2000, expense: 9800 },
  { name: 'Feb', income: 2780, expense: 3908 },
  { name: 'Mar', income: 1890, expense: 4800 },
  { name: 'Apr', income: 2390, expense: 3800 },
];

const dailyTrend = [
  { name: '1', value: 1200 },
  { name: '3', value: 2400 },
  { name: '5', value: 1800 },
  { name: '7', value: 3800 },
  { name: '9', value: 2100 },
  { name: '11', value: 2900 },
  { name: '13', value: 1600 },
  { name: '15', value: 3100 },
];

export default function ReportsView({ spendingData, currency }: ReportsViewProps) {
  const [timeFilter, setTimeFilter] = useState("This Month");

  const formatCurrency = (amount: number) => {
    return `${currency}${amount.toLocaleString("en-IN")}`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Reports</h1>
          <p className={styles.pageSubtitle}>Visual insights into your financial habits</p>
        </div>
        
        <div className={styles.filterPills}>
          {["This Month", "Last Month", "This Year", "Custom"].map(f => (
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
      <div className={styles.chartCard} style={{ minHeight: "400px" }}>
        <h3 className={styles.cardTitle}>Income vs. Expenses — Last 6 Months</h3>
        <div style={{ flex: 1, position: "relative", minHeight: "300px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
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
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-tertiary)" }} tickFormatter={(val) => `₹${val/1000}k`} />
              <RechartsTooltip 
                contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "var(--shadow-sm)" }}
              />
              <Area type="monotone" dataKey="income" stroke="var(--success)" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
              <Area type="monotone" dataKey="expense" stroke="var(--danger)" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <div style={{ display: "flex", gap: "24px", marginTop: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--text-secondary)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)" }}></span> Income
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--text-secondary)" }}>
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
                    data={spendingData}
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {spendingData.map((entry: any, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "var(--shadow-lg)" }}
                    formatter={(value: any) => formatCurrency(Number(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-primary)" }}>{formatCurrency(34560)}</div>
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Total spent</div>
              </div>
            </div>

            <div className={styles.donutLegend}>
              {spendingData.map((item: any, index) => (
                <div key={index} className={styles.legendRow}>
                  <div className={styles.legendLabel}>
                    <div className={styles.legendColor} style={{ backgroundColor: item.color }}></div>
                    {item.name}
                  </div>
                  <div className={styles.legendAmount}>{formatCurrency(item.value)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* LINE: Daily Spending Trend */}
        <div className={styles.chartCard}>
          <h3 className={styles.cardTitle}>Daily Spending Trend</h3>
          <div style={{ flex: 1, minHeight: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-tertiary)" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-tertiary)" }} tickFormatter={(val) => `₹${val/1000}k`} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "var(--shadow-sm)" }}
                />
                <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
