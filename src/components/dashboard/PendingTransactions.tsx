"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Mail, Zap, Bot, ChevronDown, ChevronUp } from "lucide-react";
import { approvePendingAction, discardPendingAction } from "@/app/actions/gmail";
import styles from "./pending.module.css";

interface PendingTransaction {
  id: string;
  type: string;
  amount: number;
  date: string;
  note: string;
  confidence: number;
  raw_snippet: string;
  parsed_by: string;
  status: string;
  accounts?: { name: string } | null;
}

interface PendingTransactionsProps {
  transactions: PendingTransaction[];
  currency: string;
}

export function PendingTransactions({ transactions, currency }: PendingTransactionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (transactions.length === 0) return null;

  const fmt = (amount: number) => `${currency}${amount.toLocaleString("en-IN")}`;

  const handleApprove = (id: string) => {
    setProcessingId(id);
    startTransition(async () => {
      await approvePendingAction(id);
      setProcessingId(null);
      router.refresh();
    });
  };

  const handleDiscard = (id: string) => {
    setProcessingId(id);
    startTransition(async () => {
      await discardPendingAction(id);
      setProcessingId(null);
      router.refresh();
    });
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) return { label: "High", cls: styles.badgeHigh };
    if (confidence >= 0.75) return { label: "Med", cls: styles.badgeMed };
    return { label: "Low", cls: styles.badgeLow };
  };

  const getSourceIcon = (parsedBy: string) => {
    return parsedBy === "llm" ? <Bot size={14} /> : <Zap size={14} />;
  };

  return (
    <div className={styles.container}>
      <button className={styles.header} onClick={() => setExpanded(!expanded)}>
        <div className={styles.headerLeft}>
          <Mail size={18} />
          <span className={styles.headerTitle}>Pending Transactions</span>
          <span className={styles.badge}>{transactions.length}</span>
        </div>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {expanded && (
        <div className={styles.list}>
          {transactions.map(txn => {
            const conf = getConfidenceBadge(txn.confidence);
            const isProcessing = processingId === txn.id;

            return (
              <div key={txn.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardMerchant}>{txn.note || "Bank Transaction"}</div>
                    <div className={styles.cardMeta}>
                      {getSourceIcon(txn.parsed_by)}
                      <span>{txn.parsed_by === "llm" ? "AI Parsed" : "Regex Parsed"}</span>
                      <span className={conf.cls}>{conf.label}</span>
                      {txn.accounts?.name && <span>• {txn.accounts.name}</span>}
                    </div>
                  </div>
                  <div className={styles.cardAmount}>
                    <span className={txn.type === "expense" ? styles.amountExpense : styles.amountIncome}>
                      {txn.type === "expense" ? "−" : "+"}{fmt(txn.amount)}
                    </span>
                    <span className={styles.cardDate}>
                      {new Date(txn.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>

                {txn.raw_snippet && (
                  <div className={styles.snippet}>{txn.raw_snippet}</div>
                )}

                <div className={styles.cardActions}>
                  <button
                    className={styles.btnApprove}
                    onClick={() => handleApprove(txn.id)}
                    disabled={isProcessing}
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    className={styles.btnDiscard}
                    onClick={() => handleDiscard(txn.id)}
                    disabled={isProcessing}
                  >
                    <X size={14} /> Discard
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
