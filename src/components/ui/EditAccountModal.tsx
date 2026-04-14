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

      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
        <label className={styles.inputLabel}>Current Balance</label>
        <CurrencyInput 
          value={balance} 
          onChange={setBalance} 
          currency="₹" 
        />
      </div>

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
