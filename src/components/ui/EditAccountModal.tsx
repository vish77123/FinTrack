"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BaseModal } from "./BaseModal";
import { CurrencyInput } from "./CurrencyInput";
import { updateAccountAction, archiveAccountAction } from "@/app/actions/accounts";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./ui.module.css";

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: {
    id: string;
    name: string;
    type: string;
    balance: number;
    // CC-specific optional fields
    credit_limit?: number | null;
    outstanding_balance?: number | null;
    statement_day?: number | null;
    due_day?: number | null;
    min_payment_pct?: number | null;
  } | null;
}

export function EditAccountModal({ isOpen, onClose, account }: EditAccountModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [balance, setBalance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);

  // Credit card specific fields
  const [creditLimit, setCreditLimit] = useState("");
  const [outstandingBalance, setOutstandingBalance] = useState("");
  const [statementDay, setStatementDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [minPaymentPct, setMinPaymentPct] = useState("5");

  const isCreditCard = type === "credit_card";

  // Populate form when account changes
  useEffect(() => {
    if (account) {
      setName(account.name);
      setType(account.type);
      setBalance(account.balance.toString());
      setErrorMsg("");

      // Populate CC fields
      setCreditLimit(account.credit_limit != null ? String(account.credit_limit) : "");
      setOutstandingBalance(account.outstanding_balance != null ? String(account.outstanding_balance) : "");
      setStatementDay(account.statement_day != null ? String(account.statement_day) : "");
      setDueDay(account.due_day != null ? String(account.due_day) : "");
      setMinPaymentPct(account.min_payment_pct != null ? String(account.min_payment_pct) : "5");
    }
  }, [account]);

  const handleSubmit = async () => {
    setErrorMsg("");
    if (!name) return setErrorMsg("Please enter an account name.");
    if (!account) return;
    if (isCreditCard && (!creditLimit || parseFloat(creditLimit) <= 0)) {
      return setErrorMsg("Please enter a valid credit limit.");
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("type", type);
    formData.append("balance", isCreditCard ? "0" : (balance || "0"));

    // CC fields
    if (isCreditCard) {
      formData.append("credit_limit", creditLimit);
      formData.append("outstanding_balance", outstandingBalance || "0");
      if (statementDay) formData.append("statement_day", statementDay);
      if (dueDay) formData.append("due_day", dueDay);
      formData.append("min_payment_pct", minPaymentPct || "5");
    }

    const result = await updateAccountAction(account.id, formData);

    if (result.error) {
      setErrorMsg(result.error);
      setIsSubmitting(false);
    } else {
      setIsSubmitting(false);
      onClose();
      router.refresh();
    }
  };

  const handleArchive = async () => {
    if (!account) return;
    setIsSubmitting(true);
    const result = await archiveAccountAction(account.id);
    if (result.error) {
      setErrorMsg(result.error);
      setIsSubmitting(false);
      setIsArchiveConfirmOpen(false);
    } else {
      setIsSubmitting(false);
      setIsArchiveConfirmOpen(false);
      onClose();
      router.refresh();
    }
  };

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
      <button 
        className="btn" 
        style={{ color: "var(--danger)", border: "none", background: "transparent" }}
        onClick={() => setIsArchiveConfirmOpen(true)}
        disabled={isSubmitting}
        type="button"
      >
        Archive Account
      </button>
      <div style={{ display: "flex", gap: "12px" }}>
        <button 
          className="btn" 
          style={{ background: "transparent", color: "var(--text-secondary)", border: "none" }} 
          onClick={onClose}
          disabled={isSubmitting}
          type="button"
        >
          Cancel
        </button>
        <button 
          className="btn btn-primary" 
          onClick={handleSubmit}
          disabled={isSubmitting}
          type="button"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Account"
      footer={footer}
    >
      {errorMsg && (
        <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "12px", borderRadius: "8px", marginBottom: "20px", fontSize: "14px" }}>
          {errorMsg}
        </div>
      )}

      <div className={styles.formGroup}>
        <label className={styles.inputLabel}>Account Name</label>
        <input 
          type="text" 
          placeholder="e.g. Chase Checking"
          className={styles.formInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.inputLabel}>Account Type</label>
        <select 
          className={`${styles.formInput} ${styles.formSelect}`}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="bank">Bank Account</option>
          <option value="credit_card">Credit Card</option>
          <option value="cash">Cash Wallet</option>
          <option value="investment">Investment</option>
          <option value="savings">Savings</option>
          <option value="contact">Contact / Roommate</option>
        </select>
      </div>

      {/* Standard balance field — hidden for credit cards */}
      {!isCreditCard && (
        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.inputLabel}>Current Balance</label>
          <CurrencyInput 
            value={balance} 
            onChange={setBalance} 
            currency="₹" 
          />
        </div>
      )}

      {/* Credit Card Settings section */}
      {isCreditCard && (
        <div style={{
          marginTop: "8px",
          paddingTop: "16px",
          borderTop: "1px solid var(--border)",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px",
          }}>
            <span style={{ fontSize: "16px" }}>💳</span>
            <span style={{
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.6px",
              color: "var(--text-secondary)",
            }}>
              Credit Card Settings
            </span>
          </div>

          {/* Credit Limit */}
          <div className={styles.formGroup}>
            <label className={styles.inputLabel}>Credit Limit <span style={{ color: "var(--danger)" }}>*</span></label>
            <CurrencyInput value={creditLimit} onChange={setCreditLimit} currency="₹" />
          </div>

          {/* Current Outstanding */}
          <div className={styles.formGroup}>
            <label className={styles.inputLabel}>Current Outstanding</label>
            <CurrencyInput value={outstandingBalance} onChange={setOutstandingBalance} currency="₹" />
          </div>

          {/* Statement Day + Due Day */}
          <div style={{ display: "flex", gap: "12px" }}>
            <div className={styles.formGroup} style={{ flex: 1 }}>
              <label className={styles.inputLabel}>Statement Date <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontSize: "11px" }}>(1–28)</span></label>
              <input
                type="number"
                min={1}
                max={28}
                placeholder="e.g. 15"
                className={styles.formInput}
                value={statementDay}
                onChange={(e) => setStatementDay(e.target.value)}
              />
            </div>
            <div className={styles.formGroup} style={{ flex: 1 }}>
              <label className={styles.inputLabel}>Payment Due Date <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontSize: "11px" }}>(1–28)</span></label>
              <input
                type="number"
                min={1}
                max={28}
                placeholder="e.g. 5"
                className={styles.formInput}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
          </div>

          {/* Min Payment % */}
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label className={styles.inputLabel}>Minimum Payment %</label>
            <input
              type="number"
              min={1}
              max={100}
              step={0.5}
              placeholder="5"
              className={styles.formInput}
              value={minPaymentPct}
              onChange={(e) => setMinPaymentPct(e.target.value)}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={isArchiveConfirmOpen}
        onConfirm={handleArchive}
        onCancel={() => setIsArchiveConfirmOpen(false)}
        title="Archive Account"
        message={`Are you sure you want to archive "${account?.name}"? You can't add new transactions to it, but its history will be kept.`}
        confirmText="Archive"
        variant="danger"
        isPending={isSubmitting}
      />
    </BaseModal>
  );
}
