"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Smartphone, Mail, Bot, Zap, Pencil, CheckSquare, Square, Check, X } from "lucide-react";
import { approvePendingAction, discardPendingAction, approvePendingBulkAction, discardPendingBulkAction } from "@/app/actions/gmail";
import { useUIStore } from "@/store/useUIStore";
import styles from "./dashboard.module.css";

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

interface PendingTrayProps {
  items: PendingTransaction[];
  currency: string;
}

export default function PendingTray({ items, currency }: PendingTrayProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingBulk, setProcessingBulk] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { setEditingTransaction } = useUIStore();

  if (!items || items.length === 0) return null;

  const fmt = (amount: number) => `${currency}${amount.toLocaleString("en-IN")}`;

  const toggleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(t => t.id)));
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.size === 0) return;
    setProcessingBulk(true);
    startTransition(async () => {
      await approvePendingBulkAction(Array.from(selectedIds));
      setSelectedIds(new Set());
      setProcessingBulk(false);
      router.refresh();
    });
  };

  const handleBulkDiscard = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.size === 0) return;
    setProcessingBulk(true);
    startTransition(async () => {
      await discardPendingBulkAction(Array.from(selectedIds));
      setSelectedIds(new Set());
      setProcessingBulk(false);
      router.refresh();
    });
  };

  const handleConfirm = (id: string) => {
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

  const getSourceIcon = (parsedBy: string) => {
    return parsedBy === "llm" ? <Bot size={12} className="mr-1 inline" /> : <Zap size={12} className="mr-1 inline" />;
  };

  // Very simple category guessing based on notes, since UI has food/transport icons
  const getCategoryIcon = (note: string) => {
    const lnote = note.toLowerCase();
    if (lnote.includes("uber") || lnote.includes("ola") || lnote.includes("rapido")) return "🚗";
    if (lnote.includes("swiggy") || lnote.includes("zomato") || lnote.includes("mcdonalds") || lnote.includes("food") || lnote.includes("parlour")) return "🍔";
    if (lnote.includes("amazon") || lnote.includes("flipkart") || lnote.includes("myntra") || lnote.includes("swiggy instamart") || lnote.includes("blinkit")) return "🛒";
    return "💳";
  };

  return (
    <div className={styles.pendingTray}>
      <div className={styles.pendingTrayHeader}>
        <div className={styles.headerLeft}>
          <div onClick={toggleSelectAll} className={`${styles.checkboxWrapperTray} ${styles.inWarning}`}>
            {selectedIds.size > 0 && selectedIds.size === items.length ? (
              <CheckSquare size={16} />
            ) : (
              <Square size={16} />
            )}
          </div>
          <AlertCircle size={16} />
          <span>{items.length} transactions auto-detected. Review and add them to your ledger.</span>
        </div>

        {selectedIds.size > 0 && (
          <div className={styles.bulkActionsTray}>
            <button 
              className={`${styles.actionBtn} ${styles.discard}`}
              disabled={processingBulk}
              onClick={handleBulkDiscard}
              style={{ display: 'flex', alignItems: 'center', padding: '6px 12px' }}
            >
              <X size={14} className="mr-1" /> Discard ({selectedIds.size})
            </button>
            <button 
              className={`${styles.actionBtn} ${styles.confirm}`}
              disabled={processingBulk}
              onClick={handleBulkConfirm}
              style={{ display: 'flex', alignItems: 'center', padding: '6px 12px' }}
            >
              <Check size={14} className="mr-1" /> Confirm ({selectedIds.size})
            </button>
          </div>
        )}
      </div>
      
      <div>
        {items.map((item) => {
          const isSelected = selectedIds.has(item.id);
          const isProcessing = processingId === item.id || processingBulk;

          return (
            <div 
              key={item.id} 
              className={`${styles.pendingItem} ${isSelected ? styles.pendingItemSelected : ""}`}
              onClick={(e) => toggleSelect(item.id, e)}
              style={{ opacity: isProcessing ? 0.5 : 1 }}
            >
              <div className={styles.checkboxWrapperTray}>
                {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              </div>
              <div className={styles.txnIcon}>
                {getCategoryIcon(item.note)}
              </div>
            
            <div className={styles.txnDetails}>
              <div className={styles.txnMerchant}>{item.note || "Bank Transaction"}</div>
              <div className={styles.txnMeta}>
                <span className={item.type === "expense" ? "text-red-500" : "text-green-500"}>
                  {item.type === "expense" ? "−" : "+"}{fmt(item.amount)}
                </span>
                {item.accounts?.name && <span> • {item.accounts.name}</span>}
                <span className={styles.pendingSource} style={{ marginLeft: "8px" }}>
                  {getSourceIcon(item.parsed_by)}
                  {item.parsed_by === "llm" ? "AI Parsed" : "Regex Parsed"}
                </span>
                <span>• {new Date(item.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
              </div>
            </div>
            
            <div className={styles.pendingActions}>
              <button 
                className={`${styles.actionBtn} ${styles.discard}`}
                onClick={(e) => { e.stopPropagation(); handleDiscard(item.id); }}
                disabled={isProcessing}
              >
                Discard
              </button>
              <button 
                className={`${styles.actionBtn}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTransaction({
                    id: item.id,
                    type: item.type as "income" | "expense" | "transfer",
                    amount: item.amount,
                    account_id: (item as any).account_id || "",
                    category_id: (item as any).category_id || null,
                    date: item.date || new Date().toISOString(),
                    note: item.note || "",
                    source: "pending",
                  });
                }}
                disabled={isProcessing}
                style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
              >
                <Pencil size={13} /> Edit
              </button>
              <button 
                className={`${styles.actionBtn} ${styles.confirm}`}
                onClick={(e) => { e.stopPropagation(); handleConfirm(item.id); }}
                disabled={isProcessing}
              >
                Confirm
              </button>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
