"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Search, Calendar, Trash2 } from "lucide-react";
import styles from "./transactions.module.css";
import { useUIStore } from "@/store/useUIStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteTransactionAction } from "@/app/actions/deleteTransaction";

interface TransactionsViewProps {
  transactions: any[];
  currency: string;
  categories?: any[];
  accounts?: any[];
}

export default function TransactionsView({ transactions, currency, categories = [], accounts = [] }: TransactionsViewProps) {
  const { setTransactionModalOpen } = useUIStore();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filter state
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState("");

  const formatCurrency = (amount: number, type: string) => {
    const prefix = type === "expense" ? "− " : "+ ";
    return `${prefix}${currency}${amount.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  const getIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case "groceries": return "🛒";
      case "dining": return "☕";
      case "salary": return "💰";
      case "transport": return "⛽";
      case "bills": return "📱";
      case "shopping": return "🛍️";
      case "rent": return "🏠";
      case "food": return "🍔";
      case "entertainment": return "🎬";
      case "income": return "💰";
      default: return "🔖";
    }
  };

  // Compute unique categories and accounts from transactions for filter dropdowns
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach(group => {
      group.transactions.forEach((txn: any) => {
        if (txn.category) cats.add(txn.category);
      });
    });
    return Array.from(cats).sort();
  }, [transactions]);

  const uniqueAccounts = useMemo(() => {
    const accs = new Set<string>();
    transactions.forEach(group => {
      group.transactions.forEach((txn: any) => {
        if (txn.account) accs.add(txn.account);
      });
    });
    return Array.from(accs).sort();
  }, [transactions]);

  // Apply all filters to produce filtered transaction groups
  const filteredTransactions = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return transactions
      .map(group => {
        const filteredTxns = group.transactions.filter((txn: any) => {
          // Type filter
          if (typeFilter !== "all") {
            if (typeFilter === "transfers" && txn.type !== "transfer") return false;
            if (typeFilter !== "transfers" && txn.type !== typeFilter) return false;
          }

          // Search filter
          if (query) {
            const matchMerchant = (txn.merchant || "").toLowerCase().includes(query);
            const matchCategory = (txn.category || "").toLowerCase().includes(query);
            const matchNote = (txn.note || "").toLowerCase().includes(query);
            if (!matchMerchant && !matchCategory && !matchNote) return false;
          }

          // Category filter
          if (categoryFilter !== "all" && txn.category !== categoryFilter) return false;

          // Account filter
          if (accountFilter !== "all" && txn.account !== accountFilter) return false;

          return true;
        });

        if (filteredTxns.length === 0) return null;

        return { ...group, transactions: filteredTxns };
      })
      .filter(Boolean);
  }, [transactions, typeFilter, searchQuery, categoryFilter, accountFilter]);

  // CSV Export
  const handleExportCSV = () => {
    const headers = ["Date", "Type", "Category", "Description", "Amount", "Account"];
    const rows: string[][] = [];

    filteredTransactions.forEach((group: any) => {
      group.transactions.forEach((txn: any) => {
        rows.push([
          group.dateLabel,
          txn.type,
          txn.category || "",
          txn.merchant || "",
          txn.amount?.toString() || "0",
          txn.account || "",
        ]);
      });
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `fintrack_transactions_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Delete handlers
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
    <div className={styles.container}>
      {/* HEADER SECTION */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Transactions</h1>
          <p className={styles.pageSubtitle}>All your income and expenses in one place</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.searchBox}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search transactions..."
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className={styles.btnSecondary} onClick={handleExportCSV}>
            <Download size={16} /> Export CSV
          </button>
          <button className="btn btn-primary hide-mobile" onClick={() => setTransactionModalOpen(true)}>
            <Plus size={16} /> Add Transaction
          </button>
        </div>
      </div>

      {/* FILTER BAR SECTION */}
      <div className={styles.filterRow}>
        <div className={styles.segmentedToggle}>
          <button className={`${styles.toggleBtn} ${typeFilter === "all" ? styles.active : ""}`} onClick={() => setTypeFilter("all")}>All</button>
          <button className={`${styles.toggleBtn} ${typeFilter === "income" ? styles.active : ""}`} onClick={() => setTypeFilter("income")}>Income</button>
          <button className={`${styles.toggleBtn} ${typeFilter === "expense" ? styles.active : ""}`} onClick={() => setTypeFilter("expense")}>Expense</button>
          <button className={`${styles.toggleBtn} ${typeFilter === "transfers" ? styles.active : ""}`} onClick={() => setTypeFilter("transfers")}>Transfers</button>
        </div>

        <div className={styles.dropdownFilters}>
          <select
            className={styles.filterDropdown}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {uniqueCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            className={styles.filterDropdown}
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          >
            <option value="all">All Accounts</option>
            {uniqueAccounts.map(acc => (
              <option key={acc} value={acc}>{acc}</option>
            ))}
          </select>
        </div>
      </div>

      {/* DETAILED LIST VIEW */}
      <div className={styles.transactionsContainer}>
        {filteredTransactions.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-tertiary)" }}>
            <p style={{ fontSize: "16px", fontWeight: 500, marginBottom: "8px" }}>No transactions found</p>
            <p style={{ fontSize: "14px" }}>Try adjusting your filters or search query.</p>
          </div>
        ) : (
          filteredTransactions.map((group: any) => (
            <div key={group.id} className={styles.dateGroupContainer}>
              <div className={styles.dateHeader}>{group.dateLabel}</div>
              
              <div className={styles.groupItems}>
                {group.transactions.map((txn: any) => {
                  const isExpense = txn.type === "expense";
                  
                  return (
                    <div key={txn.id} className={styles.transactionRow} style={{ opacity: isPending ? 0.6 : 1 }}>
                      
                      {/* Left: Icon, Title, Subtitle */}
                      <div className={styles.rowLeft}>
                        <div className={styles.txnIconWrap}>
                          {getIcon(txn.category)}
                        </div>
                        <div className={styles.txnDetails}>
                          <div className={styles.txnTitle}>{txn.merchant}</div>
                          <div className={styles.txnSubtitle}>{txn.note || txn.category}</div>
                        </div>
                      </div>

                      {/* Right: Badge, Amount, Account, Delete */}
                      <div className={styles.rowRight}>
                        <div className={`${styles.typeBadge} ${isExpense ? styles.badgeExpense : styles.badgeIncome}`}>
                          {isExpense ? "Expense" : "Income"}
                        </div>
                        <div className={styles.amountBlock}>
                          <div className={`${styles.txnAmount} ${isExpense ? styles.textDanger : styles.textSuccess}`}>
                            {formatCurrency(txn.amount, txn.type)}
                          </div>
                          <div className={styles.txnAccount}>{txn.account}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteClick(txn.id, txn.merchant)}
                          disabled={isPending}
                          className={styles.deleteBtn}
                          title="Delete Transaction"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete confirmation */}
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
