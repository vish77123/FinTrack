"use client";

import { useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { Plus, Pencil } from "lucide-react";
import { EditAccountModal } from "@/components/ui/EditAccountModal";
import styles from "./accounts.module.css";

interface AccountsViewProps {
  accounts: any[];
  netWorth: number;
  currency: string;
}

export default function AccountsView({ accounts, netWorth, currency }: AccountsViewProps) {
  const { setAddAccountModalOpen } = useUIStore();
  const [editingAccount, setEditingAccount] = useState<any>(null);

  const formatCurrency = (amount: number, forcePositive = false) => {
    const val = amount || 0;
    return `${currency}${forcePositive ? Math.abs(val).toLocaleString("en-IN") : val.toLocaleString("en-IN")}`;
  };

  const getIcon = (type: string) => {
    switch(type) {
      case "bank": return "🏦";
      case "credit_card": return "💳";
      case "cash": return "💵";
      case "investment": return "📈";
      case "savings": return "🏦";
      default: return "🏦";
    }
  };

  const getBadgeClass = (type: string) => {
    switch(type) {
      case "bank": return styles.badgeBank;
      case "credit_card": return styles.badgeCredit;
      case "cash": return styles.badgeCash;
      default: return styles.badgeBank;
    }
  };

  const getBadgeText = (type: string) => {
    switch(type) {
      case "bank": return "Bank";
      case "credit_card": return "Credit";
      case "cash": return "Cash";
      case "investment": return "Investment";
      case "savings": return "Savings";
      default: return "Account";
    }
  };

  return (
    <div className={styles.container}>
      {/* HEADER SECTION */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Accounts</h1>
          <p className={styles.pageSubtitle}>Manage your bank accounts, cards, and wallets</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAddAccountModalOpen(true)}>
          <Plus size={16} /> Add Account
        </button>
      </div>

      {/* HERO BANNER - Total Net Worth */}
      <div className={styles.heroBanner}>
        <div className={styles.heroLabel}>
          <span className={styles.heroLabelSpan}></span> Total Net Worth
        </div>
        <div className={styles.heroAmount}>{formatCurrency(netWorth)}</div>
        <div className={styles.heroSubtext}>
          Across {accounts.length} account{accounts.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ACCOUNTS GRID */}
      <div className={styles.cardsGrid}>
        
        {accounts.map((acc: any) => {
          const isNegative = acc.balance < 0;
          return (
            <div key={acc.id} className={styles.accountCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>{getIcon(acc.type)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className={`${styles.cardBadge} ${getBadgeClass(acc.type)}`}>
                    {getBadgeText(acc.type)}
                  </div>
                  <button
                    className={styles.editBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingAccount(acc);
                    }}
                    title="Edit Account"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </div>

              <div className={`${styles.cardAmount} ${isNegative ? styles.negative : ""}`}>
                {isNegative ? `− ${formatCurrency(acc.balance, true)}` : formatCurrency(acc.balance)}
              </div>
              <div className={styles.cardName}>{acc.name}</div>

              <div className={styles.cardDivider}></div>

              {/* Dynamic stats based on account type */}
              <div className={styles.cardStats}>
                {acc.type === "credit_card" ? (
                  <>
                    <div className={styles.statItem}>Spent: <span className={styles.statValue}>{formatCurrency(acc.balance, true)}</span></div>
                    <div className={styles.statItem}>Limit: <span className={styles.statValue}>{formatCurrency(150000)}</span></div>
                  </>
                ) : (
                  <>
                    <div className={styles.statItem}>Type: <span className={styles.statValue}>{getBadgeText(acc.type)}</span></div>
                    <div className={styles.statItem}>Balance: <span className={styles.statValue}>{formatCurrency(acc.balance)}</span></div>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* ADD NEW CARD ELEMENT */}
        <div className={styles.addNewCard} onClick={() => setAddAccountModalOpen(true)}>
          <Plus size={24} />
          <span>Add New Account</span>
        </div>

      </div>

      {/* Edit Account Modal */}
      <EditAccountModal
        isOpen={!!editingAccount}
        onClose={() => setEditingAccount(null)}
        account={editingAccount}
      />
    </div>
  );
}
