import { TrendingUp, TrendingDown, CreditCard } from "lucide-react";
import styles from "./dashboard.module.css";

interface SummaryGridProps {
  todaySpent: number;
  income: number;
  expenses: number;
  savings: number;
  currency: string;
  totalCCDebt?: number;
  ccCardCount?: number;
}

export default function SummaryGrid({ todaySpent, income, expenses, savings, currency, totalCCDebt = 0, ccCardCount = 0 }: SummaryGridProps) {
  const fmt = (amount: number) =>
    `${currency}${Math.abs(amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const isDeficit = savings < 0;

  return (
    <div className={styles.summaryGrid}>
      <div className={`${styles.summaryCard} ${styles.primary}`}>
        <div className={styles.label}>Today&apos;s Spending</div>
        <div className={styles.amount}>{fmt(todaySpent)}</div>
        <div className={`${styles.trend} ${styles.positive}`}>
          <div className={styles.trendIcon}>
            <TrendingUp size={10} color="var(--success)" />
          </div>
          <span>+2.4% vs last month</span>
        </div>
      </div>

      <div className={styles.summaryCard}>
        <div className={styles.label}>Income</div>
        <div className={styles.amount}>{fmt(income)}</div>
        <div className={`${styles.trend} ${styles.positive}`}>
          <div className={styles.trendIcon}>
            <TrendingUp size={10} color="var(--success)" />
          </div>
          <span>+₹5,000 Expected</span>
        </div>
      </div>

      <div className={styles.summaryCard}>
        <div className={styles.label}>Expenses</div>
        <div className={styles.amount}>{fmt(expenses)}</div>
        <div className={`${styles.trend} ${styles.negative}`}>
          <div className={styles.trendIcon}>
            <TrendingDown size={10} color="var(--danger)" />
          </div>
          <span>-12% vs last month</span>
        </div>
      </div>

      {/* Savings — shows deficit in red when expenses exceed income */}
      <div className={styles.summaryCard} style={isDeficit ? { borderColor: "var(--danger)" } : undefined}>
        <div className={styles.label}>Total Savings</div>
        <div className={styles.amount} style={isDeficit ? { color: "var(--danger)" } : undefined}>
          {isDeficit ? `−${fmt(savings)}` : fmt(savings)}
        </div>
        <div className={`${styles.trend} ${isDeficit ? styles.negative : styles.positive}`}>
          <div className={styles.trendIcon}>
            {isDeficit
              ? <TrendingDown size={10} color="var(--danger)" />
              : <TrendingUp size={10} color="var(--success)" />
            }
          </div>
          <span>{isDeficit ? "Spending over income" : "On track"}</span>
        </div>
      </div>

      {/* Total CC Debt card — only shown when user has credit card accounts */}
      {ccCardCount > 0 && (
        <div className={styles.summaryCard} style={{
          borderColor: totalCCDebt > 0 ? "var(--danger)" : "var(--border)",
          background: totalCCDebt > 0 ? "var(--danger-light)" : undefined,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <CreditCard size={12} color={totalCCDebt > 0 ? "var(--danger)" : "var(--text-secondary)"} />
            <div className={styles.label} style={{ color: totalCCDebt > 0 ? "var(--danger)" : undefined, marginBottom: 0 }}>Total CC Debt</div>
          </div>
          <div className={styles.amount} style={{ color: totalCCDebt > 0 ? "var(--danger)" : "var(--text-primary)" }}>
            {fmt(totalCCDebt)}
          </div>
          <div className={styles.trend} style={{ color: "var(--text-tertiary)" }}>
            <span>Across {ccCardCount} card{ccCardCount > 1 ? "s" : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
