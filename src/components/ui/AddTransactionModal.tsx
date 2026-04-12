"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BaseModal } from "./BaseModal";
import { CurrencyInput } from "./CurrencyInput";
import { SegmentedControl } from "./SegmentedControl";
import { CategoryPicker } from "./CategoryPicker";
import { addTransactionAction, editTransactionAction, updatePendingTransactionAction, convertToSplitAction } from "@/app/actions/transactions";
import { useUIStore } from "@/store/useUIStore";
import styles from "./ui.module.css";

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableAccounts: any[];
  availableCategories?: any[];
}

// Fallback categories — only used when the user has no categories in their DB yet
const DEFAULT_CATEGORIES = [
  { id: "income-default", name: "Income", icon: "💰", color: "#34C759" },
  { id: "food-default", name: "Food", icon: "🍔", color: "#FF9500" },
  { id: "transport-default", name: "Transport", icon: "🚗", color: "#636366" },
  { id: "housing-default", name: "Housing", icon: "🏠", color: "#6C63FF" },
  { id: "entertainment-default", name: "Entertainment", icon: "🎬", color: "#FF3B30" },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SplitRow {
  amount: string;
  destination: string;
  destinationLabel: string;
  note: string;
}

export function AddTransactionModal({ isOpen, onClose, availableAccounts, availableCategories = [] }: AddTransactionModalProps) {
  const router = useRouter();
  const { editingTransaction, setEditingTransaction } = useUIStore();
  const isEditing = !!editingTransaction;

  // Use real categories from DB if available, otherwise show defaults
  const categories = availableCategories.length > 0 ? availableCategories : DEFAULT_CATEGORIES;

  // Separate contacts from regular accounts
  const bankAccounts = useMemo(() => availableAccounts.filter(a => a.type !== 'contact'), [availableAccounts]);
  const contactAccounts = useMemo(() => availableAccounts.filter(a => a.type === 'contact'), [availableAccounts]);

  const [type, setType] = useState<"income" | "expense" | "transfer">("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(availableAccounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Split mode state
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([
    { amount: "", destination: "", destinationLabel: "", note: "" },
    { amount: "", destination: "", destinationLabel: "", note: "" }
  ]);
  const [expandedSplit, setExpandedSplit] = useState<number | null>(null);

  // Computed values for split mode
  const totalAmount = parseFloat(amount || "0");
  const splitSum = splits.reduce((acc, s) => acc + parseFloat(s.amount || "0"), 0);
  const remaining = totalAmount - splitSum;
  const isBalanced = Math.abs(remaining) < 0.01 && totalAmount > 0;

  // When editingTransaction changes, pre-fill the form
  useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmount(String(editingTransaction.amount));
      setAccountId(editingTransaction.account_id || availableAccounts[0]?.id || "");
      setCategoryId(editingTransaction.category_id || "");
      setDate(editingTransaction.date ? new Date(editingTransaction.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
      setNote(editingTransaction.note || "");

      if (editingTransaction.splitChildren && editingTransaction.splitChildren.length > 0) {
        // Editing a split parent — pre-fill all children as split rows and auto-open split mode
        setIsSplitMode(true);
        setSplits(editingTransaction.splitChildren.map((c: any) => ({
          amount: String(c.amount),
          destination: c.transfer_to_account_id ? c.transfer_to_account_id : (c.category_id || ""),
          destinationLabel: c.transfer_account_name || c.category || "",
          // ⚠️ Do NOT pre-fill individual split note from child.note:
          // child.note is the old merchant/transaction name and would override
          // the user's updated main note field. The per-split note is only for
          // optional sub-notes (e.g. "John's share") — leave empty so the
          // main note field propagates to all children on save.
          note: "",
        })));
      } else {
        // Reset split state (user can toggle if desired) — pre-fill first row as starting point
        setIsSplitMode(false);
        setSplits([
          {
            amount: String(editingTransaction.amount),
            destination: editingTransaction.category_id || "",
            destinationLabel: "",
            note: editingTransaction.note || "",
          },
          { amount: "", destination: "", destinationLabel: "", note: "" }
        ]);
      }
    } else {
      // Reset to defaults when closing edit mode
      setType("expense");
      setAmount("");
      setAccountId(availableAccounts[0]?.id || "");
      setCategoryId("");
      setDate(new Date().toISOString().split("T")[0]);
      setNote("");
      setIsSplitMode(false);
      setSplits([
        { amount: "", destination: "", destinationLabel: "", note: "" },
        { amount: "", destination: "", destinationLabel: "", note: "" }
      ]);
      setExpandedSplit(null);
    }
    setErrorMsg("");
  }, [editingTransaction, availableAccounts]);

  const handleClose = () => {
    setEditingTransaction(null);
    onClose();
  };

  // Split helper: divide equally
  const handleSplitEqually = () => {
    if (totalAmount <= 0 || splits.length === 0) return;
    const perSplit = Math.floor((totalAmount / splits.length) * 100) / 100;
    const remainder = Math.round((totalAmount - perSplit * splits.length) * 100) / 100;
    const updated = splits.map((s, i) => ({
      ...s,
      amount: i === 0 ? String(perSplit + remainder) : String(perSplit)
    }));
    setSplits(updated);
  };

  // Split helper: auto-fill remaining into last empty split
  const handleAutoFillRemaining = (index: number) => {
    if (remaining <= 0) return;
    const updated = [...splits];
    updated[index] = { ...updated[index], amount: String(Math.round(remaining * 100) / 100 + parseFloat(updated[index].amount || "0")) };
    setSplits(updated);
  };

  const updateSplit = (index: number, field: keyof SplitRow, value: string) => {
    const updated = [...splits];
    updated[index] = { ...updated[index], [field]: value };
    
    // If selecting a destination, cache its label for display
    if (field === 'destination') {
      const cat = categories.find(c => c.id === value);
      const acc = availableAccounts.find(a => a.id === value);
      updated[index].destinationLabel = cat?.name || acc?.name || '';
    }
    
    setSplits(updated);
  };

  const addSplit = () => {
    setSplits([...splits, { amount: "", destination: "", destinationLabel: "", note: "" }]);
  };

  const removeSplit = (index: number) => {
    if (splits.length <= 2) return;
    setSplits(splits.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setErrorMsg("");

    if (!amount || parseFloat(amount) <= 0) {
      return setErrorMsg("Please enter a valid amount.");
    }
    if (!accountId) return setErrorMsg("Please select an account.");
    if (type === "transfer") {
      if (!toAccountId) return setErrorMsg("Please select a destination account.");
      if (accountId === toAccountId) return setErrorMsg("Source and destination accounts must be different.");
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("amount", amount);
    formData.append("type", type);
    formData.append("account_id", accountId);

    if (type === "transfer") {
      formData.append("transfer_to_account_id", toAccountId);
    }

    // Only send category_id for non-transfers if it's a real database UUID
    if (type !== "transfer" && categoryId && UUID_REGEX.test(categoryId)) {
      formData.append("category_id", categoryId);
    }

    formData.append("date", new Date(date).toISOString());
    if (note) formData.append("note", note);

    if (isSplitMode && type !== 'transfer') {
      // Validate splits
      if (!isBalanced) {
        setIsSubmitting(false);
        return setErrorMsg(`Split amounts must equal ₹${totalAmount.toLocaleString("en-IN")}. Currently ₹${splitSum.toLocaleString("en-IN")}.`);
      }

      const finalSplits = [];
      for (const sp of splits) {
        if (!sp.amount || parseFloat(sp.amount) <= 0) {
          setIsSubmitting(false);
          return setErrorMsg("Each split must have a positive amount.");
        }
        if (!sp.destination) {
          setIsSubmitting(false);
          return setErrorMsg("Please assign a category or contact for each split.");
        }

        const isAccount = availableAccounts.some(a => a.id === sp.destination);
        finalSplits.push({
           amount: sp.amount,
           // Main note (merchant name) always wins; per-split note is only a fallback
           // for cases where the main note is intentionally blank.
           note: note || sp.note,
           type: isAccount ? "transfer" : type,
           category_id: isAccount ? null : sp.destination,
           transfer_to_account_id: isAccount ? sp.destination : null,
           date: new Date(date).toISOString()
        });
      }

      formData.append("isSplit", "true");
      formData.append("splits", JSON.stringify(finalSplits));
    }

    let result;
    if (isEditing) {
      if (editingTransaction.source === "pending") {
        // Pending transactions can't be converted to splits
        result = await updatePendingTransactionAction(editingTransaction.id, formData);
      } else if (editingTransaction.splitGroupId) {
        // Editing entire split parent group — uses splitGroupId to delete all siblings and recreate
        result = await convertToSplitAction(editingTransaction.splitGroupId, formData, true);
      } else if (isSplitMode) {
        // Convert existing single transaction into multiple splits
        result = await convertToSplitAction(editingTransaction.id, formData);
      } else {
        result = await editTransactionAction(editingTransaction.id, formData);
      }
    } else {
      result = await addTransactionAction(formData);
    }

    if (result.error) {
      setErrorMsg(result.error);
      setIsSubmitting(false);
    } else {
      setAmount("");
      setNote("");
      setCategoryId("");
      setToAccountId("");
      setIsSplitMode(false);
      setSplits([
        { amount: "", destination: "", destinationLabel: "", note: "" },
        { amount: "", destination: "", destinationLabel: "", note: "" }
      ]);
      setIsSubmitting(false);
      setEditingTransaction(null);
      onClose();
      router.refresh();
    }
  };

  // Get friendly label for a destination ID
  const getDestLabel = (destId: string) => {
    if (!destId) return null;
    const cat = categories.find(c => c.id === destId);
    if (cat) return { label: cat.name, icon: cat.icon || "🔖", isContact: false };
    const acc = availableAccounts.find(a => a.id === destId);
    if (acc) return { label: acc.name, icon: acc.type === 'contact' ? "👤" : "🏦", isContact: acc.type === 'contact' };
    return null;
  };

  // Percentage for the progress bar
  const progressPct = totalAmount > 0 ? Math.min((splitSum / totalAmount) * 100, 100) : 0;
  const isOverAllocated = splitSum > totalAmount + 0.01;

  const footer = (
    <>
      <button
        className="btn"
        style={{ background: "transparent", color: "var(--text-secondary)", border: "none" }}
        onClick={handleClose}
        disabled={isSubmitting}
      >
        Cancel
      </button>
      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={isSubmitting}
        style={{ opacity: isSubmitting ? 0.7 : 1 }}
      >
      {isSubmitting ? "Saving..." : isEditing && isSplitMode ? "Convert to Split" : isEditing ? "Update Transaction" : "Save Transaction"}
      </button>
    </>
  );

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} title={isEditing && isSplitMode ? "Convert to Split" : isEditing ? "Edit Transaction" : "Add Transaction"} footer={footer}>
      {errorMsg && (
        <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "12px", borderRadius: "8px", marginBottom: "20px", fontSize: "14px" }}>
          {errorMsg}
        </div>
      )}

      <SegmentedControl value={type} onChange={setType} />

      <CurrencyInput value={amount} onChange={setAmount} currency="₹" />

      {type === "transfer" ? (
        <div style={{ display: "flex", gap: "12px", width: "100%" }}>
          <div className={styles.formGroup} style={{ flex: 1 }}>
            <label className={styles.inputLabel}>From Account</label>
            <select
              className={`${styles.formInput} ${styles.formSelect}`}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {availableAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.type === 'contact' ? '👤 ' : ''}{acc.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup} style={{ flex: 1 }}>
            <label className={styles.inputLabel}>To Account</label>
            <select
              className={`${styles.formInput} ${styles.formSelect}`}
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
            >
              <option value="" disabled>Select destination</option>
              {availableAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.type === 'contact' ? '👤 ' : ''}{acc.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.formGroup}>
            <label className={styles.inputLabel}>Account</label>
            <select
              className={`${styles.formInput} ${styles.formSelect}`}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {bankAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} (₹{(acc.balance || 0).toLocaleString("en-IN")})
                </option>
              ))}
              {contactAccounts.length > 0 && (
                <optgroup label="Contacts">
                  {contactAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      👤 {acc.name} (₹{(acc.balance || 0).toLocaleString("en-IN")})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* ===== SPLIT TOGGLE ===== */}
          {/* Hidden for: split children (can't re-split), pending transactions, transfer type */}
          {!editingTransaction?.isSplitChild &&
           (!isEditing || (isEditing && editingTransaction?.source !== "pending" && (type as string) !== "transfer")) && (
            <div style={{ marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => setIsSplitMode(!isSplitMode)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: `1.5px solid ${isSplitMode ? "var(--accent)" : "var(--border)"}`,
                  background: isSplitMode ? "var(--accent-light)" : "var(--bg)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  fontFamily: "inherit",
                }}
              >
                <span style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: isSplitMode ? "var(--accent)" : "var(--card)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  transition: "all 0.2s ease",
                }}>
                  {isSplitMode ? "✂️" : "✂️"}
                </span>
                <div style={{ textAlign: "left", flex: 1 }}>
                  <div style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: isSplitMode ? "var(--accent)" : "var(--text-primary)",
                  }}>
                    Split Transaction
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                    {isSplitMode
                      ? isEditing
                        ? "Will replace this transaction with linked splits"
                        : "Splitting across categories & contacts"
                      : "Divide between categories or roommates"}
                  </div>
                </div>
                <div style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  border: `2px solid ${isSplitMode ? "var(--accent)" : "var(--border)"}`,
                  background: isSplitMode ? "var(--accent)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                }}>
                  {isSplitMode && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </button>
            </div>
          )}

          {isSplitMode ? (
            /* ===== SPLIT ALLOCATION PANEL ===== */
            <div style={{
              background: "var(--bg)",
              borderRadius: "14px",
              border: "1px solid var(--border)",
              overflow: "hidden",
              marginBottom: "20px",
            }}>
              {/* Edit mode: show a clear warning that original will be replaced */}
              {isEditing && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  background: "var(--warning-light)",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "12px",
                  color: "var(--warning)",
                  fontWeight: 500,
                }}>
                  ⚠️ The original transaction will be deleted and replaced with these splits.
                </div>
              )}
              {/* Progress Header */}
              <div style={{
                padding: "16px 16px 12px",
                borderBottom: "1px solid var(--border)",
              }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}>
                  <span style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.5px",
                    color: "var(--text-secondary)",
                  }}>
                    Split Allocation
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={handleSplitEqually}
                      disabled={totalAmount <= 0}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: totalAmount > 0 ? "var(--accent)" : "var(--text-tertiary)",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        cursor: totalAmount > 0 ? "pointer" : "not-allowed",
                        fontFamily: "inherit",
                        transition: "all 0.15s ease",
                      }}
                    >
                      ÷ Equal
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{
                  height: "6px",
                  borderRadius: "3px",
                  background: "var(--card)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    borderRadius: "3px",
                    width: `${progressPct}%`,
                    background: isOverAllocated
                      ? "var(--danger)"
                      : isBalanced
                        ? "var(--success)"
                        : "var(--accent)",
                    transition: "width 0.3s ease, background 0.3s ease",
                  }} />
                </div>

                {/* Summary */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "8px",
                  fontSize: "12px",
                }}>
                  <span style={{ color: "var(--text-tertiary)" }}>
                    Allocated: <strong style={{ color: "var(--text-primary)" }}>₹{splitSum.toLocaleString("en-IN")}</strong>
                  </span>
                  <span style={{
                    color: isOverAllocated
                      ? "var(--danger)"
                      : isBalanced
                        ? "var(--success)"
                        : "var(--warning)",
                    fontWeight: 600,
                  }}>
                    {isOverAllocated
                      ? `Over by ₹${Math.abs(remaining).toLocaleString("en-IN")}`
                      : isBalanced
                        ? "✓ Balanced"
                        : `₹${remaining.toLocaleString("en-IN")} remaining`}
                  </span>
                </div>
              </div>

              {/* Split Rows */}
              <div style={{ padding: "0" }}>
                {splits.map((split, i) => {
                  const destInfo = getDestLabel(split.destination);
                  return (
                    <div key={i} style={{
                      borderBottom: i < splits.length - 1 ? "1px solid var(--border)" : "none",
                    }}>
                      <div style={{
                        display: "flex",
                        gap: "8px",
                        padding: "12px 16px",
                        alignItems: "center",
                      }}>
                        {/* Row Number */}
                        <div style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: destInfo?.isContact ? "var(--warning-light)" : "var(--accent-light)",
                          color: destInfo?.isContact ? "var(--warning)" : "var(--accent)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {i + 1}
                        </div>

                        {/* Amount Input */}
                        <div style={{ position: "relative", width: "110px", flexShrink: 0 }}>
                          <span style={{
                            position: "absolute",
                            left: "10px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--text-tertiary)",
                            fontSize: "13px",
                            fontWeight: 600,
                            pointerEvents: "none",
                          }}>₹</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={split.amount}
                            onChange={e => updateSplit(i, "amount", e.target.value)}
                            onFocus={() => setExpandedSplit(i)}
                            style={{
                              width: "100%",
                              padding: "10px 10px 10px 26px",
                              border: "1.5px solid var(--border)",
                              borderRadius: "8px",
                              background: "var(--surface)",
                              color: "var(--text-primary)",
                              fontSize: "14px",
                              fontWeight: 600,
                              fontFamily: "inherit",
                              outline: "none",
                              transition: "border-color 0.2s",
                            }}
                          />
                          {/* Auto-fill remaining button */}
                          {remaining > 0.01 && (!split.amount || parseFloat(split.amount) === 0) && (
                            <button
                              type="button"
                              onClick={() => handleAutoFillRemaining(i)}
                              style={{
                                position: "absolute",
                                right: "4px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                background: "var(--accent-light)",
                                border: "none",
                                borderRadius: "4px",
                                color: "var(--accent)",
                                fontSize: "10px",
                                fontWeight: 700,
                                padding: "2px 6px",
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                              title={`Fill ₹${remaining.toLocaleString("en-IN")}`}
                            >
                              REST
                            </button>
                          )}
                        </div>

                        {/* Destination Selector */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <select
                            value={split.destination}
                            onChange={e => updateSplit(i, "destination", e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px 32px 10px 12px",
                              border: "1.5px solid var(--border)",
                              borderRadius: "8px",
                              background: "var(--surface)",
                              color: split.destination ? "var(--text-primary)" : "var(--text-tertiary)",
                              fontSize: "13px",
                              fontWeight: 500,
                              fontFamily: "inherit",
                              outline: "none",
                              appearance: "none",
                              cursor: "pointer",
                              backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>')`,
                              backgroundRepeat: "no-repeat",
                              backgroundPosition: "right 10px center",
                              transition: "border-color 0.2s",
                            }}
                          >
                            <option value="">Category / Contact…</option>
                            <optgroup label="📂 Categories">
                              {categories.map(c => (
                                <option value={c.id} key={c.id}>{c.icon || '🔖'} {c.name}</option>
                              ))}
                            </optgroup>
                            {contactAccounts.length > 0 && (
                              <optgroup label="👥 Contacts">
                                {contactAccounts.filter(a => a.id !== accountId).map(a => (
                                  <option value={a.id} key={a.id}>👤 {a.name}</option>
                                ))}
                              </optgroup>
                            )}
                            {bankAccounts.filter(a => a.id !== accountId).length > 0 && (
                              <optgroup label="🏦 Other Accounts">
                                {bankAccounts.filter(a => a.id !== accountId).map(a => (
                                  <option value={a.id} key={a.id}>{a.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </div>

                        {/* Remove button */}
                        {splits.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeSplit(i)}
                            style={{
                              width: "28px",
                              height: "28px",
                              borderRadius: "6px",
                              border: "none",
                              background: "transparent",
                              color: "var(--text-tertiary)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "18px",
                              flexShrink: 0,
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = "var(--danger-light)";
                              e.currentTarget.style.color = "var(--danger)";
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "var(--text-tertiary)";
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Expandable note row */}
                      {expandedSplit === i && (
                        <div style={{
                          padding: "0 16px 12px 48px",
                          animation: "fadeIn 0.2s ease",
                        }}>
                          <input
                            type="text"
                            placeholder="Add note for this split..."
                            value={split.note}
                            onChange={e => updateSplit(i, "note", e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              border: "1px solid var(--border)",
                              borderRadius: "6px",
                              background: "var(--surface)",
                              color: "var(--text-primary)",
                              fontSize: "12px",
                              fontFamily: "inherit",
                              outline: "none",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Split Button */}
              <div style={{ padding: "0 16px 12px" }}>
                <button
                  type="button"
                  onClick={addSplit}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1.5px dashed var(--border)",
                    background: "transparent",
                    color: "var(--accent)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "var(--accent-light)";
                    e.currentTarget.style.borderColor = "var(--accent)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "var(--border)";
                  }}
                >
                  <span style={{ fontSize: "16px" }}>+</span> Add Another Split
                </button>
              </div>
            </div>
          ) : (
            <CategoryPicker 
              label="Category (Optional)"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              transactionType={type}
            />
          )}

        </>
      )}

      <div className={styles.formGroup}>
        <label className={styles.inputLabel}>Date</label>
        <input
          type="date"
          className={styles.formInput}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
        <label className={styles.inputLabel}>Note (Optional)</label>
        <input
          type="text"
          placeholder="e.g. Dinner with friends"
          className={styles.formInput}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </BaseModal>
  );
}
