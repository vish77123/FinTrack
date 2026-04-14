"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BaseModal } from "./BaseModal";
import { CurrencyInput } from "./CurrencyInput";
import { addAccountAction } from "@/app/actions/accounts";
import styles from "./ui.module.css";
import { mockData } from "@/lib/mockData";

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddAccountModal({ isOpen, onClose }: AddAccountModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [balance, setBalance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Credit card specific fields
  const [creditLimit, setCreditLimit] = useState("");
  const [outstandingBalance, setOutstandingBalance] = useState("");
  const [statementDay, setStatementDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [minPaymentPct, setMinPaymentPct] = useState("5");

  const isCreditCard = type === "credit_card";

  const handleSubmit = async () => {
    setErrorMsg("");
    if (!name) return setErrorMsg(type === "contact" ? "Please enter a contact name." : "Please enter an account name.");
    if (isCreditCard && (!creditLimit || parseFloat(creditLimit) <= 0)) {
      return setErrorMsg("Please enter a valid credit limit.");
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("type", type);
    if (!isCreditCard && balance) formData.append("balance", balance);

    // CC fields
    if (isCreditCard) {
      formData.append("credit_limit", creditLimit);
      if (outstandingBalance) formData.append("outstanding_balance", outstandingBalance);
      if (statementDay) formData.append("statement_day", statementDay);
      if (dueDay) formData.append("due_day", dueDay);
      formData.append("min_payment_pct", minPaymentPct || "5");
    }

    const result = await addAccountAction(formData);

    if (result.error) {
      setErrorMsg(result.error);
      setIsSubmitting(false);
    } else {
      setName("");
      setBalance("");
      setType("bank");
      setCreditLimit("");
      setOutstandingBalance("");
      setStatementDay("");
      setDueDay("");
      setMinPaymentPct("5");
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
      >
        {isSubmitting ? "Creating..." : "Create Account"}
      </button>
    </>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Account"
      footer={footer}
    >
      {errorMsg && (
        <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "12px", borderRadius: "8px", marginBottom: "20px", fontSize: "14px" }}>
          {errorMsg}
        </div>
      )}

      <div className={styles.formGroup}>
        <label className={styles.inputLabel}>{type === "contact" ? "Contact Name" : "Account Name"}</label>
        <input 
          type="text" 
          placeholder={type === "contact" ? "e.g. John (Roommate)" : isCreditCard ? "e.g. HDFC Diners Club" : "e.g. Chase Checking"}
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
          <label className={styles.inputLabel}>{type === "contact" ? "Initial Debt (leave 0 if none)" : "Initial Balance"}</label>
          <CurrencyInput 
            value={balance} 
            onChange={setBalance} 
            currency={mockData.currency} 
          />
        </div>
      )}

      {/* Credit Card Settings section */}
      {isCreditCard && (
        <>
          <div style={{
            marginTop: "8px",
            marginBottom: "12px",
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

            {/* Credit Limit — required */}
            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Credit Limit <span style={{ color: "var(--danger)" }}>*</span></label>
              <CurrencyInput value={creditLimit} onChange={setCreditLimit} currency="₹" />
            </div>

            {/* Current Outstanding */}
            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Current Outstanding <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(leave blank if 0)</span></label>
              <CurrencyInput value={outstandingBalance} onChange={setOutstandingBalance} currency="₹" />
            </div>

            {/* Statement Day + Due Day side by side */}
            <div style={{ display: "flex", gap: "12px" }}>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label className={styles.inputLabel}>Statement Date <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(day of month)</span></label>
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
                <label className={styles.inputLabel}>Payment Due Date <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(day of month)</span></label>
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
              <label className={styles.inputLabel}>Minimum Payment % <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(default: 5%)</span></label>
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
        </>
      )}
    </BaseModal>
  );
}
