"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Smartphone,
  Bot,
  Zap,
  Pencil,
  Check,
  X,
  ChevronRight,
  ListChecks,
  CheckSquare,
  Square,
} from "lucide-react";
import {
  approvePendingAction,
  discardPendingAction,
  approvePendingBulkAction,
  discardPendingBulkAction,
} from "@/app/actions/gmail";
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

const INITIAL_VISIBLE = 4; // Show up to 4 ultra-compact rows
const SWIPE_THRESHOLD = 80;

export default function PendingTray({ items, currency }: PendingTrayProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingBulk, setProcessingBulk] = useState(false);
  
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { setEditingTransaction } = useUIStore();

  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  if (!items || items.length === 0) return null;

  const fmt = (amount: number) =>
    `${currency}${amount.toLocaleString("en-IN")}`;

  const totalAmount = items.reduce((s, i) => s + Number(i.amount), 0);
  const visibleItems = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  const hiddenCount = items.length - INITIAL_VISIBLE;

  const toggleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((t) => t.id)));
    }
  };

  const handleToggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.size === 0) return;
    setProcessingBulk(true);
    startTransition(async () => {
      await approvePendingBulkAction(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsSelectMode(false);
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
      setIsSelectMode(false);
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
    if (parsedBy.startsWith("sms-")) return <Smartphone size={10} />;
    return parsedBy === "llm" ? <Bot size={10} /> : <Zap size={10} />;
  };

  const getSourceLabel = (parsedBy: string) => {
    if (parsedBy.startsWith("sms-")) return "SMS";
    return parsedBy === "llm" ? "AI" : "Regex";
  };

  const getCategoryIcon = (note: string) => {
    const lnote = note.toLowerCase();
    if (lnote.includes("uber") || lnote.includes("ola") || lnote.includes("rapido")) return "🚗";
    if (lnote.includes("swiggy") || lnote.includes("zomato") || lnote.includes("mcdonalds") || lnote.includes("food") || lnote.includes("parlour")) return "🍔";
    if (lnote.includes("amazon") || lnote.includes("flipkart") || lnote.includes("myntra") || lnote.includes("blinkit") || lnote.includes("zepto")) return "🛒";
    return "💳";
  };

  return (
    <div className={styles.pendingTray}>
      <div
        className={`${styles.pendingBanner} ${expanded ? styles.pendingBannerExpanded : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={styles.bannerLeft}>
          <div className={styles.bannerPulse} />
          <span className={styles.bannerText}>
            <span className={styles.bannerCount}>{items.length}</span> pending
            <span className={styles.bannerAmount}> · {fmt(totalAmount)} total</span>
          </span>
        </div>
        <div className={styles.bannerRight}>
          <ChevronDown
            size={18}
            className={`${styles.bannerChevron} ${expanded ? styles.bannerChevronOpen : ""}`}
          />
        </div>
      </div>

      {expanded && (
        <div className={styles.pendingBody}>
          {/* Universal Bulk Action Header */}
          {items.length > 0 && (
            <div className={styles.bulkBar} style={{ padding: "8px 12px", border: "none", boxShadow: "none", background: "transparent", margin: "-4px 0 -8px" }}>
              {!isSelectMode ? (
                // View Mode Actions
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                  <div className={styles.bulkBarLeft} style={{ cursor: "default", color: "var(--text-primary)" }}>
                    <ListChecks size={16} />
                    <span>Review Pending</span>
                  </div>
                  <button
                    className={`${styles.bulkBtn}`}
                    style={{ background: "transparent", color: "var(--text-secondary)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSelectMode(true);
                      // Optionally clear selection whenever entering select mode
                      setSelectedIds(new Set());
                    }}
                  >
                    Select
                  </button>
                </div>
              ) : (
                // Select Mode Actions
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <button
                      className={`${styles.bulkBtn}`}
                      style={{ background: "transparent", color: "var(--text-secondary)", padding: "4px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSelectMode(false);
                        setSelectedIds(new Set());
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className={`${styles.bulkBtn}`}
                      style={{ background: "transparent", color: "var(--accent)", padding: "4px" }}
                      onClick={toggleSelectAll}
                    >
                      {selectedIds.size === items.length ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                  <div className={styles.bulkBarActions}>
                    <button
                      className={`${styles.bulkBtn} ${styles.bulkBtnDiscard}`}
                      style={{ background: "transparent", border: "1px solid var(--border)", opacity: selectedIds.size === 0 ? 0.5 : 1 }}
                      disabled={processingBulk || selectedIds.size === 0}
                      onClick={handleBulkDiscard}
                    >
                      Discard ({selectedIds.size})
                    </button>
                    <button
                      className={`${styles.bulkBtn} ${styles.bulkBtnConfirm}`}
                      style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
                      disabled={processingBulk || selectedIds.size === 0}
                      onClick={handleBulkConfirm}
                    >
                      Confirm ({selectedIds.size})
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {visibleItems.map((item) => (
            <PendingCard
              key={item.id}
              item={item}
              currency={currency}
              isProcessing={processingId === item.id || processingBulk}
              isSelectMode={isSelectMode}
              isSelected={selectedIds.has(item.id)}
              onToggleSelect={handleToggleSelect}
              onConfirm={handleConfirm}
              onDiscard={handleDiscard}
              onEdit={(it) => {
                setEditingTransaction({
                  id: it.id,
                  type: it.type as "income" | "expense" | "transfer",
                  amount: it.amount,
                  account_id: (it as any).account_id || "",
                  category_id: (it as any).category_id || null,
                  date: it.date || new Date().toISOString(),
                  note: it.note || "",
                  source: "pending",
                  original_synced_name: (it as any).original_synced_name,
                });
              }}
              getCategoryIcon={getCategoryIcon}
              getSourceIcon={getSourceIcon}
              getSourceLabel={getSourceLabel}
              fmt={fmt}
            />
          ))}

          {!showAll && hiddenCount > 0 && (
            <button className={styles.showMoreBtn} onClick={() => setShowAll(true)}>
              <ChevronRight size={14} />
              Show {hiddenCount} more transaction{hiddenCount > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface PendingCardProps {
  item: PendingTransaction;
  currency: string;
  isProcessing: boolean;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onConfirm: (id: string) => void;
  onDiscard: (id: string) => void;
  onEdit: (item: PendingTransaction) => void;
  getCategoryIcon: (note: string) => string;
  getSourceIcon: (parsedBy: string) => React.ReactNode;
  getSourceLabel: (parsedBy: string) => string;
  fmt: (amount: number) => string;
}

function PendingCard({
  item,
  isProcessing,
  isSelectMode,
  isSelected,
  onToggleSelect,
  onConfirm,
  onDiscard,
  onEdit,
  getCategoryIcon,
  getSourceIcon,
  getSourceLabel,
  fmt,
}: PendingCardProps) {
  const swipeRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipeOffset = useRef(0);
  const isSwipingRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isSelectMode) return;
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    swipeOffset.current = 0;
    isSwipingRef.current = false;
  }, [isSelectMode]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isSelectMode) return;
    if (!touchStart.current || !swipeRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;

    if (!isSwipingRef.current && Math.abs(dy) > Math.abs(dx)) {
      touchStart.current = null;
      return;
    }

    isSwipingRef.current = true;
    const clamped = Math.max(-120, Math.min(120, dx));
    swipeOffset.current = clamped;
    swipeRef.current.style.transform = `translateX(${clamped}px)`;
    swipeRef.current.style.transition = "none";
  }, [isSelectMode]);

  const handleTouchEnd = useCallback(() => {
    if (isSelectMode) return;
    if (!swipeRef.current) return;
    const offset = swipeOffset.current;

    swipeRef.current.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

    if (offset < -SWIPE_THRESHOLD) {
      swipeRef.current.style.transform = "translateX(-100%)";
      setTimeout(() => onDiscard(item.id), 250);
    } else if (offset > SWIPE_THRESHOLD) {
      swipeRef.current.style.transform = "translateX(100%)";
      setTimeout(() => onConfirm(item.id), 250);
    } else {
      swipeRef.current.style.transform = "translateX(0)";
    }

    touchStart.current = null;
    swipeOffset.current = 0;
    // Delay resetting swipe flag slightly so we don't accidentally trigger the onClick
    setTimeout(() => {
      isSwipingRef.current = false;
    }, 50);
  }, [isSelectMode, item.id, onConfirm, onDiscard]);

  const dateStr = new Date(item.date).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={`${styles.pendingCard} ${isSelected ? styles.pendingCardSelected : ""}`}
      style={{ opacity: isProcessing ? 0.5 : 1 }}
      onClick={(e) => {
        if (isSelectMode) {
           onToggleSelect(item.id, e);
        } else {
          // Only trigger edit if not intentionally swiping
          if (!isSwipingRef.current && swipeOffset.current === 0) {
             e.stopPropagation();
             onEdit(item);
          }
        }
      }}
    >
      <div className={styles.swipeWrapper}>
        <div className={styles.swipeRevealLeft}>
          <X size={18} style={{ marginRight: 4 }} /> Discard
        </div>
        <div className={styles.swipeRevealRight}>
          Confirm <Check size={18} style={{ marginLeft: 4 }} />
        </div>

        <div
          ref={swipeRef}
          className={styles.swipeContent}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className={styles.cardIcon}>
            {isSelectMode ? (
              isSelected ? <CheckSquare size={18} color="var(--accent)" /> : <Square size={18} color="var(--text-tertiary)" />
            ) : (
              getCategoryIcon(item.note)
            )}
          </div>

          <div className={styles.cardInfo}>
            <div className={styles.cardMerchant}>{item.note || "Bank Transaction"}</div>
            <div className={styles.cardMeta}>
              {item.accounts?.name && <span>{item.accounts.name}</span>}
              {item.accounts?.name && <span className={styles.cardMetaDot} />}
              <span>{dateStr}</span>
              <span className={styles.cardMetaDot} />
              <span className={styles.cardSourceBadge}>
                {getSourceIcon(item.parsed_by)}
                {getSourceLabel(item.parsed_by)}
              </span>
            </div>
          </div>

          <div className={styles.cardAmountContainer}>
            <div className={`${styles.cardAmount} ${item.type === "expense" ? styles.cardAmountExpense : styles.cardAmountIncome}`}>
              {item.type === "expense" ? "−" : "+"}
              {fmt(item.amount)}
            </div>

            {/* Desktop Hover Actions fade in over the amount (hidden in select mode) */}
            {!isSelectMode && (
              <div className={styles.hoverActions}>
                <button
                  className={`${styles.iconBtn} ${styles.discard}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscard(item.id);
                  }}
                  disabled={isProcessing}
                  title="Discard"
                >
                  <X size={14} />
                </button>
                <button
                  className={`${styles.iconBtn} ${styles.edit}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(item);
                  }}
                  disabled={isProcessing}
                  title="Edit Details"
                >
                  <Pencil size={13} />
                </button>
                <button
                  className={`${styles.iconBtn} ${styles.confirm}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirm(item.id);
                  }}
                  disabled={isProcessing}
                  title="Confirm"
                >
                  <Check size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
