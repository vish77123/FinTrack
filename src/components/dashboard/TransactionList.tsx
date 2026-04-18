"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteTransactionAction, deleteAllSplitSiblingsAction } from "@/app/actions/deleteTransaction";
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
  const [deletingIsSplitGroup, setDeletingIsSplitGroup] = useState(false);

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

  const isRenderableIcon = (icon: string | null | undefined): boolean => {
    if (!icon || typeof icon !== "string") return false;
    if (/^[a-zA-Z0-9\-_]+$/.test(icon)) return false;
    return true;
  };

  const handleDeleteClick = (id: string, merchant: string, isSplitGroup = false) => {
    setDeletingId(id);
    setDeletingName(merchant);
    setDeletingIsSplitGroup(isSplitGroup);
  };

  const handleConfirmDelete = () => {
    if (!deletingId) return;
    const id = deletingId;
    const isSplit = deletingIsSplitGroup;
    startTransition(async () => {
      const res = isSplit
        ? await deleteAllSplitSiblingsAction(id)
        : await deleteTransactionAction(id);
      setDeletingId(null);
      setDeletingName("");
      setDeletingIsSplitGroup(false);
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
    setDeletingIsSplitGroup(false);
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
            // Use the expense/income child as the representative (not transfer)
            // so type, category, and amount display correctly in the summary row
            const expenseChild = children.find((c: any) => c.type !== "transfer") || children[0];
            // Total = sum of expense/income splits only (transfer = "owed by contact", not double spend)
            const expenseChildren = children.filter((c: any) => c.type !== "transfer");
            const totalAmount = expenseChildren.length > 0
              ? expenseChildren.reduce((sum: number, c: any) => sum + Number(c.amount), 0)
              : children.reduce((sum: number, c: any) => sum + Number(c.amount), 0);

            // Build a readable category summary: "Food, → Om Boke"
            const categoryLabels = children
              .map((c: any) => c.type === "transfer" ? `→ ${c.transfer_account_name || c.account}` : c.category)
              .filter(Boolean)
              .join(", ");

            finalTxns.push({
              ...expenseChild,
              id: `split_${groupId}`,
              merchant: expenseChild.merchant || expenseChild.note || "Split",
              amount: totalAmount,
              category: categoryLabels || "Split",
              isSplitGroup: true,
              splitGroupId: groupId,
              children: children,
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
                    {txn.isSplitGroup ? "✂️" : (isRenderableIcon(txn.icon) ? txn.icon : getIcon(txn.category))}
                  </div>
                  
                  <div className={styles.txnDetails}>
                    <div className={styles.txnMerchant}>
                      {txn.merchant}
                      {txn.isSplitGroup && (
                        <span style={{
                          marginLeft: '6px',
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '10px',
                          background: 'var(--accent-light)',
                          color: 'var(--accent)',
                          verticalAlign: 'middle',
                        }}>Split</span>
                      )}
                    </div>
                    <div className={styles.txnMeta}>
                      <span>{txn.category}</span> • <span>{txn.account || "Account"}</span>
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div className={`${styles.txnAmount} ${styles[txn.type]}`}>
                      {formatCurrency(txn.amount, txn.type)}
                    </div>
                    <button 
                      onClick={() => txn.isSplitGroup
                        ? handleDeleteClick(txn.splitGroupId, txn.merchant, true)
                        : handleDeleteClick(txn.id, txn.merchant)
                      }
                      disabled={isPending}
                      style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px" }}
                      title={txn.isSplitGroup ? "Delete all split items" : "Delete Transaction"}
                    >
                      <Trash2 size={16} />
                    </button>
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
        title={deletingIsSplitGroup ? "Delete All Split Items" : "Delete Transaction"}
        message={
          deletingIsSplitGroup
            ? `This will delete all split items in "${deletingName}" and reverse their balance effects. This cannot be undone.`
            : `Are you sure you want to delete "${deletingName}"? This will adjust your account balance and cannot be undone.`
        }
        confirmText="Delete"
        variant="danger"
        isPending={isPending}
      />
    </div>
  );
}
