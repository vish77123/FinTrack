"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteTransactionAction } from "@/app/actions/deleteTransaction";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import styles from "./dashboard.module.css";

interface TransactionListProps {
  items: any[];
  currency: string;
}

export default function TransactionList({ items, currency }: TransactionListProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState("");

  const formatCurrency = (amount: number, type: string) => {
    const prefix = type === "expense" ? "-" : "+";
    const val = amount || 0;
    return `${prefix}${currency}${val.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    })}`;
  };

  const getIcon = (category: string) => {
    switch (category) {
      case "Groceries": return "🛒";
      case "Income": case "Salary": return "💰";
      case "Entertainment": return "🎬";
      case "Transport": return "🚗";
      default: return "🔖";
    }
  };

  const handleDeleteClick = (id: string, merchant: string) => {
    setDeletingId(id);
    setDeletingName(merchant);
  };

  const handleConfirmDelete = () => {
    if (!deletingId) return;
    const id = deletingId;
    startTransition(async () => {
      const res = await deleteTransactionAction(id);
      setDeletingId(null);
      setDeletingName("");
      if (res.error) {
        alert(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleCancelDelete = () => {
    setDeletingId(null);
    setDeletingName("");
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Recent Transactions</h2>
        <a href="/transactions" className={styles.linkBtn}>See All</a>
      </div>
      
      <div className={styles.txnList}>
        {items.map((group) => (
          <div key={group.id}>
            <div className={styles.dateGroup}>{group.dateLabel}</div>
            
            {group.transactions.map((txn: any) => (
              <div key={txn.id} className={styles.txnItem} style={{ opacity: isPending ? 0.6 : 1 }}>
                <div 
                  className={styles.txnIcon}
                  style={txn.color ? { backgroundColor: `${txn.color}15`, color: txn.color, borderColor: `${txn.color}30` } : { background: `${txn.categoryColor || '#eee'}20`, color: txn.categoryColor || '#333' }}
                >
                  {txn.icon || getIcon(txn.category)}
                </div>
                
                <div className={styles.txnDetails}>
                  <div className={styles.txnMerchant}>{txn.merchant}</div>
                  <div className={styles.txnMeta}>
                    <span>{txn.category}</span> • <span>{txn.account || "Account"}</span>
                  </div>
                </div>
                
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div className={`${styles.txnAmount} ${styles[txn.type]}`}>
                    {formatCurrency(txn.amount, txn.type)}
                  </div>
                  <button 
                    onClick={() => handleDeleteClick(txn.id, txn.merchant)}
                    disabled={isPending}
                    style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px" }}
                    title="Delete Transaction"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* User-friendly delete confirmation */}
      <ConfirmDialog
        isOpen={!!deletingId}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        title="Delete Transaction"
        message={`Are you sure you want to delete "${deletingName}"? This will adjust your account balance and cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isPending={isPending}
      />
    </div>
  );
}
