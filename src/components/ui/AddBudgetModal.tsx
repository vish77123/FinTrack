"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BaseModal } from "./BaseModal";
import { addBudgetAction } from "@/app/actions/budgets";
import styles from "./ui.module.css";

interface AddBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: any[];
  currency: string;
}

export function AddBudgetModal({ isOpen, onClose, categories, currency }: AddBudgetModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState("");
  const [amountLimit, setAmountLimit] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = () => {
    setErrorMsg("");
    if (!categoryId) return setErrorMsg("Please select a category.");
    if (!amountLimit || parseFloat(amountLimit) <= 0) return setErrorMsg("Please enter a valid amount.");

    const formData = new FormData();
    formData.append("category_id", categoryId);
    formData.append("amount_limit", amountLimit);
    formData.append("period", period);

    startTransition(async () => {
      const res = await addBudgetAction(formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setCategoryId("");
        setAmountLimit("");
        setPeriod("monthly");
        onClose();
        router.refresh();
      }
    });
  };

  const footer = (
    <>
      <button
        className="btn"
        style={{ background: "transparent", color: "var(--text-secondary)", border: "none" }}
        onClick={onClose}
        disabled={isPending}
      >Cancel</button>
      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={isPending}
        style={{ opacity: isPending ? 0.7 : 1 }}
      >{isPending ? "Saving..." : "Create Budget"}</button>
    </>
  );

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="New Budget" footer={footer}>
      {errorMsg && (
        <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "12px", borderRadius: "8px", marginBottom: "20px", fontSize: "14px" }}>
          {errorMsg}
        </div>
      )}

      <div className={styles.formGroup}>
        <label className={styles.inputLabel}>Category</label>
        <select
          className={`${styles.formInput} ${styles.formSelect}`}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="" disabled>Select a category</option>
          {categories.map((cat: any) => (
            <option key={cat.id} value={cat.id}>
              {cat.icon || "📦"} {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.inputLabel}>Budget Limit ({currency})</label>
        <input
          type="number"
          placeholder="e.g. 10000"
          className={styles.formInput}
          value={amountLimit}
          onChange={(e) => setAmountLimit(e.target.value)}
          min="0"
          step="100"
        />
      </div>

      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
        <label className={styles.inputLabel}>Period</label>
        <div style={{ display: "flex", gap: "8px" }}>
          {["monthly", "weekly"].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: `2px solid ${period === p ? "var(--accent)" : "var(--border)"}`,
                background: period === p ? "var(--accent-light)" : "var(--surface)",
                color: period === p ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                fontFamily: "inherit",
                textTransform: "capitalize",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </BaseModal>
  );
}
