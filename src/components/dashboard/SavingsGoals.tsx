import { Target } from "lucide-react";
import styles from "./dashboard.module.css";
import { mockData } from "@/lib/mockData";

export default function SavingsGoals() {
  const formatCurrency = (amount: number) => {
    return `${mockData.currency}${amount.toLocaleString("en-IN")}`;
  };

  return (
    <div className={styles.chartCard}>
      <div className={styles.sectionHeader}>
        <h3>Savings Goals</h3>
        <a href="/budgets" className={styles.linkBtn}>Manage</a>
      </div>
      
      <div className={styles.goalsList}>
        {mockData.savingsGoals.map((goal) => {
          const progress = Math.min(100, Math.round((goal.current / goal.target) * 100));
          
          return (
            <div key={goal.id} className={styles.goalCard}>
              <div className={styles.goalHeader}>
                <div 
                  className={styles.txnIcon} 
                  style={{ background: `${goal.color}20`, color: goal.color, margin: 0 }}
                >
                  <Target size={18} />
                </div>
                <div className={styles.goalInfo}>
                  <div className={styles.goalName}>{goal.name}</div>
                  <div className={styles.goalDate}>{goal.date}</div>
                </div>
              </div>
              
              <div className={styles.goalAmounts}>
                <span>{formatCurrency(goal.current)}</span>
                <span>{formatCurrency(goal.target)}</span>
              </div>
              
              <div style={{ height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden" }}>
                <div 
                  style={{ 
                    height: "100%", 
                    width: `${progress}%`, 
                    background: goal.color,
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
