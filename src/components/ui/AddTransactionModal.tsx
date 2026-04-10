"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BaseModal } from "./BaseModal";
import { CurrencyInput } from "./CurrencyInput";
import { SegmentedControl } from "./SegmentedControl";
import { CategoryPicker } from "./CategoryPicker";
import { addTransactionAction } from "@/app/actions/transactions";
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

export function AddTransactionModal({ isOpen, onClose, availableAccounts, availableCategories = [] }: AddTransactionModalProps) {
  const router = useRouter();
  
  // Use real categories from DB if available, otherwise show defaults
  const categories = availableCategories.length > 0 ? availableCategories : DEFAULT_CATEGORIES;

  const [type, setType] = useState<"income" | "expense" | "transfer">("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(availableAccounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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

    // Only send category_id for non-transfers if it's a real database UUID — skip hardcoded fallback IDs
    if (type !== "transfer" && categoryId && UUID_REGEX.test(categoryId)) {
      formData.append("category_id", categoryId);
    }

    formData.append("date", new Date(date).toISOString());
    if (note) formData.append("note", note);

    const result = await addTransactionAction(formData);

    if (result.error) {
      setErrorMsg(result.error);
      setIsSubmitting(false);
    } else {
      setAmount("");
      setNote("");
      setCategoryId("");
      setToAccountId("");
      setIsSubmitting(false);
      onClose();
      router.refresh();
    }
  };

  const footer = (
    <>
      <button
        className="btn"
        style={{ background: "transparent", color: "var(--text-secondary)", border: "none" }}
        onClick={onClose}
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
        {isSubmitting ? "Saving..." : "Save Transaction"}
      </button>
    </>
  );

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Add Transaction" footer={footer}>
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
                  {acc.name}
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
                  {acc.name}
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
              {availableAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} (₹{(acc.balance || 0).toLocaleString("en-IN")})
                </option>
              ))}
            </select>
          </div>

          <CategoryPicker 
            label="Category (Optional)"
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            transactionType={type}
          />
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
