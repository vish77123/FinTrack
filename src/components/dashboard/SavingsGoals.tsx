import { Target } from "lucide-react";
import styles from "./dashboard.module.css";

interface SavingsGoalsProps {
  goals: any[];
  currency: string;
}

export default function SavingsGoals({ goals, currency }: SavingsGoalsProps) {
  const formatCurrency = (amount: number) => {
    const val = amount || 0;
    return `${currency}${val.toLocaleString("en-IN")}`;
  };

  return (
    <div className={styles.chartCard}>
      <div className={styles.sectionHeader}>
        <h3>Savings Goals</h3>
        <a href="/budgets" className={styles.linkBtn}>Manage</a>
      </div>
      
      <div className={styles.goalsList}>
        {goals.map((goal: any) => {
          const progress = Math.min(100, Math.round((goal.saved / goal.target) * 100));
          const colorFallback = goal.color || "var(--accent)";
          
          return (
            <div key={goal.id} className={styles.goalCard}>
              <div className={styles.goalHeader}>
                <div 
                  className={styles.txnIcon} 
                  style={{ background: `${colorFallback}20`, color: colorFallback, margin: 0 }}
                >
                  <Target size={18} />
                </div>
                <div className={styles.goalInfo}>
                  <div className={styles.goalName}>{goal.name}</div>
                  <div className={styles.goalDate}>{goal.targetDate}</div>
                </div>
              </div>
              
              <div className={styles.goalAmounts}>
                <span>{formatCurrency(goal.saved)}</span>
                <span>{formatCurrency(goal.target)}</span>
              </div>
              
              <div style={{ height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden" }}>
                <div 
                  style={{ 
                    height: "100%", 
                    width: `${progress}%`, 
                    background: colorFallback,
                    borderRadius: "3px"
                  }} 
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
