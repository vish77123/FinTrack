import { TrendingUp, TrendingDown } from "lucide-react";
import styles from "./dashboard.module.css";

interface SummaryGridProps {
  todaySpent: number;
  income: number;
  expenses: number;
  savings: number;
  currency: string;
}

export default function SummaryGrid({ todaySpent, income, expenses, savings, currency }: SummaryGridProps) {
  const formatCurrency = (amount: number) => {
    return `${currency}${amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    })}`;
  };

  return (
    <div className={styles.summaryGrid}>
      <div className={`${styles.summaryCard} ${styles.primary}`}>
        <div className={styles.label}>Today&apos;s Spending</div>
        <div className={styles.amount}>{formatCurrency(todaySpent)}</div>
        <div className={`${styles.trend} ${styles.positive}`}>
          <div className={styles.trendIcon}>
            <TrendingUp size={10} color="var(--success)" />
          </div>
          <span>+2.4% vs last month</span>
        </div>
      </div>

      <div className={styles.summaryCard}>
        <div className={styles.label}>Income</div>
        <div className={styles.amount}>{formatCurrency(income)}</div>
        <div className={`${styles.trend} ${styles.positive}`}>
          <div className={styles.trendIcon}>
            <TrendingUp size={10} color="var(--success)" />
          </div>
          <span>+₹5,000 Expected</span>
        </div>
      </div>

      <div className={styles.summaryCard}>
        <div className={styles.label}>Expenses</div>
        <div className={styles.amount}>{formatCurrency(expenses)}</div>
        <div className={`${styles.trend} ${styles.negative}`}>
          <div className={styles.trendIcon}>
            <TrendingDown size={10} color="var(--danger)" />
          </div>
          <span>-12% vs last month</span>
        </div>
      </div>

      <div className={styles.summaryCard}>
        <div className={styles.label}>Total Savings</div>
        <div className={styles.amount}>{formatCurrency(savings)}</div>
        <div className={`${styles.trend} ${styles.positive}`}>
          <div className={styles.trendIcon}>
            <TrendingUp size={10} color="var(--success)" />
          </div>
          <span>On track</span>
        </div>
      </div>
    </div>
  );
}
