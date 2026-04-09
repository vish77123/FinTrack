"use client";

import { useUIStore } from "@/store/useUIStore";
import { Plus } from "lucide-react";
import styles from "./budgets.module.css";

interface BudgetsViewProps {
  goals: any[];
  currency: string;
}

export default function BudgetsView({ goals, currency }: BudgetsViewProps) {
  const { setAddGoalModalOpen } = useUIStore();

  const formatCurrency = (amount: number) => {
    const val = amount || 0;
    return `${currency}${val.toLocaleString("en-IN")}`;
  };

  const getIcon = (name: string) => {
    if (name.includes("Trip") || name.includes("Vacation")) return "🏖️";
    if (name.includes("MacBook") || name.includes("Laptop")) return "💻";
    if (name.includes("Car")) return "🚗";
    if (name.includes("House")) return "🏠";
    return "🎯";
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Savings Goals</h1>
          <p className={styles.pageSubtitle}>Track your progress towards big purchases.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAddGoalModalOpen(true)}>
          <Plus size={16} /> Add New Goal
        </button>
      </div>

      <div className={styles.goalsGrid}>
        {goals.map((goal) => {
          const percent = Math.min(Math.round((goal.saved / goal.target) * 100), 100);
          const remaining = goal.target - goal.saved;

          return (
            <div key={goal.id} className={styles.goalCard}>
              <div className={styles.cardHeader}>
                <div className={styles.iconWrap}>{getIcon(goal.name)}</div>
                <div className={styles.goalInfo}>
                  <div className={styles.goalName}>{goal.name}</div>
                  <div className={styles.goalTargetDate}>Target: {goal.targetDate || "Ongoing"}</div>
                </div>
              </div>

              <div className={styles.progressStats}>
                <div>
                  <span className={styles.savedAmount}>{formatCurrency(goal.saved)}</span> saved
                </div>
                <div className={styles.targetAmount}>of {formatCurrency(goal.target)}</div>
              </div>

              <div className={styles.progressBarContainer}>
                <div 
                  className={styles.progressBarFill} 
                  style={{ width: `${percent}%` }}
                ></div>
              </div>

              <div className={styles.footerStats}>
                {formatCurrency(remaining)} remaining • {percent}% complete
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
