"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BaseModal } from "./BaseModal";
import { CurrencyInput } from "./CurrencyInput";
import { updateAccountAction } from "@/app/actions/accounts";
import styles from "./ui.module.css";

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: {
    id: string;
    name: string;
    type: string;
    balance: number;
  } | null;
}

export function EditAccountModal({ isOpen, onClose, account }: EditAccountModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [balance, setBalance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Populate form when account changes
  useEffect(() => {
    if (account) {
      setName(account.name);
      setType(account.type);
      setBalance(account.balance.toString());
      setErrorMsg("");
    }
  }, [account]);

  const handleSubmit = async () => {
    setErrorMsg("");
    if (!name) return setErrorMsg("Please enter an account name.");
    if (!account) return;

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("type", type);
    formData.append("balance", balance || "0");

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
        {isSubmitting ? "Saving..." : "Save Changes"}
      </button>
    </>
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
        </select>
      </div>

      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
        <label className={styles.inputLabel}>Current Balance</label>
        <CurrencyInput 
          value={balance} 
          onChange={setBalance} 
          currency="₹" 
        />
      </div>
    </BaseModal>
  );
}
