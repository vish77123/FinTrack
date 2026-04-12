"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Search, Calendar, Trash2, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import styles from "./transactions.module.css";
import { useUIStore } from "@/store/useUIStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteTransactionAction, deleteAllSplitSiblingsAction } from "@/app/actions/deleteTransaction";

interface TransactionsViewProps {
  transactions: any[];
  currency: string;
  categories?: any[];
  accounts?: any[];
}

export default function TransactionsView({ transactions, currency, categories = [], accounts = [] }: TransactionsViewProps) {
  const { setTransactionModalOpen, setEditingTransaction } = useUIStore();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filter state
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateRange, setCustomDateRange] = useState({ start: "", end: "" });

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState("");
  const [deletingIsSplitGroup, setDeletingIsSplitGroup] = useState(false);

  // Split expand state
  const [expandedSplits, setExpandedSplits] = useState<Set<string>>(new Set());

  const toggleSplitExpand = (groupId: string) => {
    setExpandedSplits(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const formatCurrency = (amount: number, type: string) => {
    const prefix = type === "expense" ? "− " : type === "transfer" ? "" : "+ ";
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

          // Date filter
          if (dateFilter !== "all") {
            const txnDateRaw = txn.date ? new Date(txn.date) : null;
            if (!txnDateRaw) return false;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (dateFilter === "today") {
              const txnDay = new Date(txnDateRaw);
              txnDay.setHours(0, 0, 0, 0);
              if (txnDay.getTime() !== today.getTime()) return false;
            } else if (dateFilter === "week") {
              const startOfWeek = new Date(today);
              startOfWeek.setDate(today.getDate() - today.getDay());
              if (txnDateRaw < startOfWeek) return false;
            } else if (dateFilter === "month") {
              if (txnDateRaw.getMonth() !== today.getMonth() || txnDateRaw.getFullYear() !== today.getFullYear()) {
                return false;
              }
            } else if (dateFilter === "custom") {
              if (customDateRange.start) {
                const start = new Date(customDateRange.start);
                start.setHours(0, 0, 0, 0);
                if (txnDateRaw < start) return false;
              }
              if (customDateRange.end) {
                const end = new Date(customDateRange.end);
                end.setHours(23, 59, 59, 999);
                if (txnDateRaw > end) return false;
              }
            }
          }

          return true;
        });

        if (filteredTxns.length === 0) return null;

        // BUNDLE SPLITS
        const finalTxns: any[] = [];
        const splitGroups = new Map<string, any[]>();

        filteredTxns.forEach((txn: any) => {
          if (txn.split_group_id) {
            if (!splitGroups.has(txn.split_group_id)) {
              splitGroups.set(txn.split_group_id, []);
            }
            splitGroups.get(txn.split_group_id)?.push(txn);
          } else {
            finalTxns.push(txn);
          }
        });

        // Add split groups back as single objects with a children property
        splitGroups.forEach((children, groupId) => {
          const totalAmount = children.reduce((sum: number, c: any) => sum + Number(c.amount), 0);
          // Use the expense child as representative, or first child
          const rep = children.find((c: any) => c.type === 'expense') || children[0];
          finalTxns.push({
            ...rep,
            id: `split_${groupId}`,
            splitGroupId: groupId,
            merchant: rep.note || rep.merchant || 'Split Transaction',
            amount: totalAmount,
            isSplitGroup: true,
            splitCount: children.length,
            children: children
          });
        });

        // Sort by time/id again since splits might be out of sync
        finalTxns.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return { ...group, transactions: finalTxns };
      })
      .filter(Boolean);
  }, [transactions, typeFilter, searchQuery, categoryFilter, accountFilter, dateFilter, customDateRange]);

  // CSV Export
  const handleExportCSV = () => {
    const headers = ["Date", "Type", "Category", "Description", "Amount", "Account"];
    const rows: string[][] = [];

    filteredTransactions.forEach((group: any) => {
      group.transactions.forEach((txn: any) => {
        if (txn.isSplitGroup && txn.children) {
          txn.children.forEach((child: any) => {
            rows.push([
              group.dateLabel,
              child.type,
              child.category || "",
              child.merchant || child.note || "",
              child.amount?.toString() || "0",
              child.account || "",
            ]);
          });
        } else {
          rows.push([
            group.dateLabel,
            txn.type,
            txn.category || "",
            txn.merchant || "",
            txn.amount?.toString() || "0",
            txn.account || "",
          ]);
        }
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
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range...</option>
          </select>

          {dateFilter === "custom" && (
            <div className={styles.dateRangeWrapper}>
              <input
                type="date"
                className={styles.dateInput}
                value={customDateRange.start}
                onChange={e => setCustomDateRange(p => ({ ...p, start: e.target.value }))}
              />
              <span className={styles.dateSeparator}>-</span>
              <input
                type="date"
                className={styles.dateInput}
                value={customDateRange.end}
                onChange={e => setCustomDateRange(p => ({ ...p, end: e.target.value }))}
              />
            </div>
          )}
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
              <div className={styles.dateHeader}>
                <span>{group.dateLabel}</span>
                <div className={styles.dateHeaderTotals}>
                  {group.dailyIncome > 0 && <span className={styles.textSuccess}>+{formatCurrency(group.dailyIncome, 'income').replace('+ ', '')}</span>}
                  {group.dailyExpense > 0 && <span className={styles.textDanger}>-{formatCurrency(group.dailyExpense, 'expense').replace('− ', '')}</span>}
                </div>
              </div>

              <div className={styles.groupItems}>
                {group.transactions.map((txn: any) => {
                  const isExpense = txn.type === "expense";
                  const isTransfer = txn.type === "transfer";
                  const isSplitGroup = txn.isSplitGroup;
                  const isExpanded = isSplitGroup && expandedSplits.has(txn.splitGroupId);

                  return (
                    <div key={txn.id} style={{ display: 'contents' }}>
                    {/* Main Transaction Row */}
                    <div
                      className={`${styles.transactionRow} ${isSplitGroup ? styles.splitRow : ''}`}
                      style={{ opacity: isPending ? 0.6 : 1, cursor: isSplitGroup ? 'pointer' : 'default' }}
                      onClick={isSplitGroup ? () => toggleSplitExpand(txn.splitGroupId) : undefined}
                    >
                      {/* Left: Icon, Title, Subtitle */}
                      <div className={styles.rowLeft}>
                        <div
                          className={styles.txnIconWrap}
                          style={txn.color ? { backgroundColor: `${txn.color}15`, color: txn.color, borderColor: `${txn.color}30` } : undefined}
                        >
                          {isSplitGroup ? "✂️" : isTransfer ? "↔️" : txn.icon || getIcon(txn.category)}
                        </div>
                        <div className={styles.txnDetails}>
                          <div className={styles.txnTitle}>
                            {txn.merchant}
                            {isSplitGroup && (
                              <span className={styles.splitBadge}>
                                Split • {txn.splitCount} items
                              </span>
                            )}
                          </div>
                          <div className={styles.txnSubtitle}>
                            {isSplitGroup ? (
                              <span>
                                {txn.children.map((c: any, i: number) => (
                                  <span key={c.id}>
                                    {c.type === 'transfer'
                                      ? `→ ${c.transfer_account_name || c.account}`
                                      : c.category}
                                    {i < txn.children.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </span>
                            ) : isTransfer ? (
                              <span>
                                {txn.account} → {txn.transfer_account_name || 'Account'}
                              </span>
                            ) : (
                              <span>{txn.category || txn.note || "Uncategorized"}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Badge, Amount, Account, Actions */}
                      <div className={styles.rowRight}>
                        <div className={`${styles.typeBadge} ${isExpense ? styles.badgeExpense : isTransfer ? styles.badgeTransfer : styles.badgeIncome}`}>
                          {isExpense ? "Expense" : isTransfer ? "Transfer" : "Income"}
                        </div>
                        <div className={styles.amountBlock}>
                          <div className={`${styles.txnAmount} ${isExpense ? styles.textDanger : isTransfer ? styles.textTransfer : styles.textSuccess}`}>
                            {formatCurrency(txn.amount, txn.type)}
                          </div>
                          <div className={styles.txnAccount}>{txn.account}</div>
                        </div>

                        {/* ===== ACTION BUTTONS ===== */}
                        {isSplitGroup ? (
                          // Split parent: Edit (whole group) + Delete (all) + Expand/Collapse
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTransaction({
                                  id: txn.children[0].id,  // representative id (not used for split group action)
                                  type: txn.type,
                                  amount: txn.amount,
                                  account_id: txn.account_id || "",
                                  category_id: txn.category_id || null,
                                  date: txn.date || new Date().toISOString(),
                                  note: txn.note || txn.merchant || "",
                                  source: "transaction",
                                  splitGroupId: txn.splitGroupId,
                                  splitChildren: txn.children,
                                });
                              }}
                              disabled={isPending}
                              className={styles.deleteBtn}
                              title="Edit entire split"
                              style={{ color: "var(--accent)" }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteClick(txn.splitGroupId, txn.merchant, true); }}
                              disabled={isPending}
                              className={styles.deleteBtn}
                              title="Delete all split items"
                              style={{ color: "var(--danger)" }}
                            >
                              <Trash2 size={15} />
                            </button>
                            <button
                              className={styles.expandBtn}
                              onClick={(e) => { e.stopPropagation(); toggleSplitExpand(txn.splitGroupId); }}
                              title={isExpanded ? "Collapse" : "Expand split details"}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        ) : (
                          // Regular transaction: Edit + Delete
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              onClick={() => setEditingTransaction({
                                id: txn.id,
                                type: txn.type,
                                amount: txn.amount,
                                account_id: txn.account_id || "",
                                category_id: txn.category_id || null,
                                date: txn.date || new Date().toISOString(),
                                note: txn.note || txn.merchant || "",
                                source: "transaction",
                              })}
                              disabled={isPending}
                              className={styles.deleteBtn}
                              title="Edit Transaction"
                              style={{ color: "var(--accent)" }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(txn.id, txn.merchant)}
                              disabled={isPending}
                              className={styles.deleteBtn}
                              title="Delete Transaction"
                              style={{ color: "var(--danger)" }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded Split Children */}
                    {isSplitGroup && isExpanded && (
                      <div className={styles.splitChildren}>
                        {txn.children.map((child: any) => {
                          const childIsExpense = child.type === "expense";
                          const childIsTransfer = child.type === "transfer";
                          return (
                            <div key={child.id} className={styles.splitChildRow}>
                              <div className={styles.childLeft}>
                                <div className={styles.splitConnector}>
                                  <div className={styles.splitConnectorLine} />
                                  <div className={styles.splitConnectorDot} />
                                </div>
                                <div className={styles.childIconWrap}>
                                  {childIsTransfer ? "👤" : child.icon || getIcon(child.category)}
                                </div>
                                <div>
                                  <div className={styles.childLabel}>
                                    {childIsTransfer
                                      ? `Transfer → ${child.transfer_account_name || 'Account'}`
                                      : child.category || 'Uncategorized'}
                                  </div>
                                  {child.note && (
                                    <div className={styles.childNote}>{child.note}</div>
                                  )}
                                </div>
                              </div>
                              <div className={styles.childRight}>
                                <span className={`${styles.childAmount} ${childIsExpense ? styles.textDanger : childIsTransfer ? styles.textTransfer : styles.textSuccess}`}>
                                  {formatCurrency(child.amount, child.type)}
                                </span>
                                {/* Edit child — isSplitChild flag hides the split toggle in modal */}
                                <button
                                  onClick={() => setEditingTransaction({
                                    id: child.id,
                                    type: child.type,
                                    amount: child.amount,
                                    account_id: child.account_id || "",
                                    category_id: child.category_id || null,
                                    date: child.date || new Date().toISOString(),
                                    note: child.note || "",
                                    source: "transaction",
                                    isSplitChild: true,
                                  })}
                                  disabled={isPending}
                                  className={styles.childEditBtn}
                                  title="Edit this split item"
                                >
                                  <Pencil size={12} />
                                </button>
                                {/* Delete individual child */}
                                <button
                                  onClick={() => handleDeleteClick(child.id, child.category || child.note || 'Split item')}
                                  disabled={isPending}
                                  className={styles.childEditBtn}
                                  title="Delete this split item"
                                  style={{ color: 'var(--danger)' }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
