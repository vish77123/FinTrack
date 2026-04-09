import { Landmark, CreditCard, PieChart } from "lucide-react";
import styles from "./dashboard.module.css";
import { mockData } from "@/lib/mockData";

export default function AccountCards() {
  const formatCurrency = (amount: number) => {
    return `${mockData.currency}${Math.abs(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    })}`;
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "Bank": return <Landmark size={20} />;
      case "Card": return <CreditCard size={20} />;
      case "Investment": return <PieChart size={20} />;
      default: return <Landmark size={20} />;
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Your Accounts</h2>
        <a href="/accounts" className={styles.linkBtn}>See All</a>
      </div>
      
      <div className={styles.accountsScroll}>
        {mockData.accounts.map((account) => (
          <div key={account.id} className={styles.accountCard}>
            <div className={styles.accountIcon}>
              {getIcon(account.type)}
            </div>
            <div className={styles.accountName}>{account.name}</div>
            <div className={styles.accountBalance}>
              {account.balance < 0 ? "-" : ""}{formatCurrency(account.balance)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
