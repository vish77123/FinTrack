"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import styles from "./budgets.module.css";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteBudgetAction } from "@/app/actions/budgets";
import { AddBudgetModal } from "@/components/ui/AddBudgetModal";

interface Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  limit: number;
  period: string;
  monthlySpent: number;
  weeklySpent: number;
}

interface BudgetsViewProps {
  budgets: Budget[];
  categories: any[];
  currency: string;
  daysLeft: number;
}

export default function BudgetsView({ budgets, categories, currency, daysLeft }: BudgetsViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [periodFilter, setPeriodFilter] = useState<"monthly" | "weekly">("monthly");
  const [showAddModal, setShowAddModal] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState("");

  const fmt = (amount: number) => `${currency}${amount.toLocaleString("en-IN")}`;

  const filteredBudgets = useMemo(() => {
    return budgets.filter(b => b.period === periodFilter);
  }, [budgets, periodFilter]);

  // Summary calculations
  const totalBudget = filteredBudgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = filteredBudgets.reduce((s, b) => s + (periodFilter === "monthly" ? b.monthlySpent : b.weeklySpent), 0);
  const totalRemaining = totalBudget - totalSpent;
  const overallPercent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  const handleDelete = (id: string, name: string) => {
    setDeletingId(id);
    setDeletingName(name);
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    startTransition(async () => {
      await deleteBudgetAction(deletingId);
      setDeletingId(null);
      setDeletingName("");
      router.refresh();
    });
  };

  return (
    <div className={styles.container}>
      {/* HEADER */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Budgets</h1>
          <p className={styles.pageSubtitle}>Track spending against your monthly limits</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.periodToggle}>
            <button 
              className={`${styles.toggleBtn} ${periodFilter === "monthly" ? styles.active : ""}`}
              onClick={() => setPeriodFilter("monthly")}
            >Monthly</button>
            <button
              className={`${styles.toggleBtn} ${periodFilter === "weekly" ? styles.active : ""}`}
              onClick={() => setPeriodFilter("weekly")}
            >Weekly</button>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> New Budget
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      {filteredBudgets.length > 0 && (
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Total Budget</div>
            <div className={styles.summaryValue}>{fmt(totalBudget)}</div>
            <div className={styles.summaryMeta}>Across {filteredBudgets.length} categories</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Spent So Far</div>
            <div className={`${styles.summaryValue} ${overallPercent > 80 ? styles.textDanger : styles.textAccent}`}>{fmt(totalSpent)}</div>
            <div className={styles.summaryProgress}>
              <div 
                className={styles.summaryProgressFill}
                style={{ 
                  width: `${Math.min(overallPercent, 100)}%`,
                  background: overallPercent > 100 ? "var(--danger)" : overallPercent > 80 ? "#FF9500" : "var(--accent)"
                }}
              />
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Remaining</div>
            <div className={`${styles.summaryValue} ${totalRemaining < 0 ? styles.textDanger : styles.textSuccess}`}>
              {fmt(Math.abs(totalRemaining))}
            </div>
            <div className={styles.summaryMeta} style={{ color: totalRemaining < 0 ? "var(--danger)" : "var(--success)" }}>
              {totalRemaining < 0 ? "Over budget!" : `${daysLeft} days left`}
            </div>
          </div>
        </div>
      )}

      {/* BUDGET CARDS GRID */}
      {filteredBudgets.length === 0 ? (
        <div className={styles.emptyState}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
          <h3>No {periodFilter} budgets set</h3>
          <p>Create your first {periodFilter} budget to start tracking spending limits.</p>
          <button className="btn btn-primary" style={{ marginTop: "16px" }} onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Create Budget
          </button>
        </div>
      ) : (
        <div className={styles.budgetGrid}>
          {filteredBudgets.map(budget => {
            const spent = periodFilter === "monthly" ? budget.monthlySpent : budget.weeklySpent;
            const percent = budget.limit > 0 ? Math.round((spent / budget.limit) * 100) : 0;
            const remaining = budget.limit - spent;
            const isOver = remaining < 0;

            let barColor = budget.categoryColor;
            let badgeClass = styles.badgeNormal;
            if (percent >= 100) {
              barColor = "var(--danger)";
              badgeClass = styles.badgeDanger;
            } else if (percent >= 75) {
              barColor = "#FF9500";
              badgeClass = styles.badgeWarning;
            }

            return (
              <div key={budget.id} className={styles.budgetCard}>
                <div className={styles.cardTop}>
                  <div className={styles.cardLeft}>
                    <div 
                      className={styles.catIcon}
                      style={{ background: `${budget.categoryColor}15`, borderColor: `${budget.categoryColor}30` }}
                    >
                      {budget.categoryIcon}
                    </div>
                    <div>
                      <div className={styles.catName}>{budget.categoryName}</div>
                      <div className={styles.catPeriod}>{periodFilter === "monthly" ? "Monthly" : "Weekly"} Budget</div>
                    </div>
                  </div>
                  <div className={styles.cardRight}>
                    {isOver ? (
                      <span className={styles.badgeDanger}>Over budget!</span>
                    ) : (
                      <span className={badgeClass}>{percent}%</span>
                    )}
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(budget.id, budget.categoryName)}
                      title="Delete budget"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className={styles.cardAmounts}>
                  <span className={styles.spentAmount} style={{ color: isOver ? "var(--danger)" : "var(--text-primary)" }}>
                    {fmt(spent)}
                  </span>
                  <span className={styles.limitAmount}>of {fmt(budget.limit)}</span>
                </div>

                <div className={styles.barTrack}>
                  <div 
                    className={styles.barFill}
                    style={{ width: `${Math.min(percent, 100)}%`, background: barColor }}
                  />
                </div>

                <div className={styles.cardFooter} style={{ color: isOver ? "var(--danger)" : "var(--text-tertiary)" }}>
                  {isOver 
                    ? `${fmt(Math.abs(remaining))} over limit`
                    : `${fmt(remaining)} remaining`
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD BUDGET MODAL */}
      <AddBudgetModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        categories={categories}
        currency={currency}
      />

      {/* DELETE CONFIRMATION */}
      <ConfirmDialog
        isOpen={!!deletingId}
        onConfirm={confirmDelete}
        onCancel={() => { setDeletingId(null); setDeletingName(""); }}
        title="Delete Budget"
        message={`Delete budget for "${deletingName}"?`}
        confirmText="Delete"
        variant="danger"
        isPending={isPending}
      />
    </div>
  );
}
