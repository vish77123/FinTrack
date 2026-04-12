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
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
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
        {items.map((group) => {
          // BUNDLE SPLITS FOR DASHBOARD
          const finalTxns: any[] = [];
          const splitGroups = new Map<string, any[]>();

          group.transactions.forEach((txn: any) => {
            if (txn.split_group_id) {
              if (!splitGroups.has(txn.split_group_id)) {
                splitGroups.set(txn.split_group_id, []);
              }
              splitGroups.get(txn.split_group_id)?.push(txn);
            } else {
              finalTxns.push(txn);
            }
          });

          splitGroups.forEach((children, groupId) => {
            const totalAmount = children.reduce((sum, c) => sum + Number(c.amount), 0);
            const rep = children[0];
            finalTxns.push({
              ...rep,
              id: `split_${groupId}`,
              merchant: `${rep.merchant} (Split)`,
              amount: totalAmount,
              isSplitGroup: true,
              children: children
            });
          });

          finalTxns.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          return (
            <div key={group.id}>
              <div className={styles.dateGroup} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{group.dateLabel}</span>
                <div style={{ display: 'flex', gap: '12px', fontSize: '13px', fontWeight: 600 }}>
                  {group.dailyIncome > 0 && <span style={{ color: 'var(--success)' }}>{formatCurrency(group.dailyIncome, 'income')}</span>}
                  {group.dailyExpense > 0 && <span style={{ color: 'var(--danger)' }}>{formatCurrency(group.dailyExpense, 'expense')}</span>}
                </div>
              </div>
              
              {finalTxns.map((txn: any) => (
                <div key={txn.id} className={`${styles.txnItem} ${txn.isSplitGroup ? styles.splitItem : ''}`} style={{ opacity: isPending ? 0.6 : 1 }}>
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
                    {!txn.isSplitGroup && (
                      <button 
                        onClick={() => handleDeleteClick(txn.id, txn.merchant)}
                        disabled={isPending}
                        style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px" }}
                        title="Delete Transaction"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
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
