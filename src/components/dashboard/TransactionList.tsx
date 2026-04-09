import styles from "./dashboard.module.css";
import { mockData } from "@/lib/mockData";

export default function TransactionList() {
  const formatCurrency = (amount: number, type: string) => {
    const prefix = type === "expense" ? "-" : "+";
    return `${prefix}${mockData.currency}${amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    })}`;
  };

  const getIcon = (category: string) => {
    switch (category) {
      case "Groceries": return "🛒";
      case "Income": return "💰";
      case "Entertainment": return "🎬";
      case "Transport": return "🚗";
      default: return "🔖";
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Recent Transactions</h2>
        <a href="/transactions" className={styles.linkBtn}>See All</a>
      </div>
      
      <div className={styles.txnList}>
        {mockData.recentTransactions.map((group) => (
          <div key={group.id}>
            <div className={styles.dateGroup}>{group.dateLabel}</div>
            
            {group.transactions.map((txn) => (
              <div key={txn.id} className={styles.txnItem}>
                <div 
                  className={styles.txnIcon}
                  style={{ background: `${txn.categoryColor}20`, color: txn.categoryColor }}
                >
                  {getIcon(txn.category)}
                </div>
                
                <div className={styles.txnDetails}>
                  <div className={styles.txnMerchant}>{txn.merchant}</div>
                  <div className={styles.txnMeta}>
                    <span>{txn.category}</span> • <span>{txn.time}</span>
                  </div>
                </div>
                
                <div className={`${styles.txnAmount} ${styles[txn.type]}`}>
                  {formatCurrency(txn.amount, txn.type)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
