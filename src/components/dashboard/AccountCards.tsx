"use client";

import { useState } from "react";
import { Landmark, CreditCard, PieChart, Wallet, Banknote, User } from "lucide-react";
import styles from "./dashboard.module.css";

interface AccountCardsProps {
  accounts: any[];
  currency: string;
  onPayBill?: (account: any) => void;
}

export default function AccountCards({ accounts, currency, onPayBill }: AccountCardsProps) {
  const formatCurrency = (amount: number) => {
    return `${currency}${Math.abs(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "bank":       return <Landmark size={18} />;
      case "credit_card": return <CreditCard size={18} />;
      case "investment": return <PieChart size={18} />;
      case "savings":    return <Banknote size={18} />;
      case "cash":       return <Wallet size={18} />;
      case "contact":    return <User size={18} />;
      default:           return <Landmark size={18} />;
    }
  };

  const getUtilizationColor = (pct: number): string => {
    if (pct < 30) return "var(--success)";
    if (pct <= 60) return "var(--warning)";
    return "var(--danger)";
  };

  const getDueColor = (days: number | null): string => {
    if (days === null) return "var(--text-secondary)";
    if (days <= 5) return "var(--danger)";
    if (days <= 10) return "var(--warning)";
    return "var(--text-secondary)";
  };

  const getDueBg = (days: number | null): string => {
    if (days === null) return "var(--card)";
    if (days <= 5) return "var(--danger-light)";
    if (days <= 10) return "var(--warning-light)";
    return "var(--card)";
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Your Accounts</h2>
        <a href="/accounts" className={styles.linkBtn}>See All</a>
      </div>
      
      <div className={styles.accountsScroll}>
        {accounts.map((account: any) => {
          const isCreditCard = account.type === "credit_card";

          if (isCreditCard) {
            const outstanding = Number(account.outstanding_balance) || 0;
            const limit = Number(account.credit_limit) || 0;
            const available = account.availableCredit ?? (limit > 0 ? Math.max(0, limit - outstanding) : null);
            const utilPct = account.utilizationPct ?? (limit > 0 ? Math.round((outstanding / limit) * 100 * 10) / 10 : null);
            const daysUntilDue = account.daysUntilDue ?? null;
            const minPayment = account.minPaymentDue ?? 0;
            const utilizationColor = utilPct !== null ? getUtilizationColor(utilPct) : "var(--text-tertiary)";

            return (
              <div key={account.id} className={styles.accountCard} style={{ minWidth: "220px", padding: "16px" }}>
                
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, var(--danger) 0%, #ff6b9d 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      flexShrink: 0,
                    }}>
                      <CreditCard size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.2 }}>{account.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>Credit Card</div>
                    </div>
                  </div>
                </div>

                {/* Outstanding / Current Due / Unbilled / Available */}
                <div style={{ marginBottom: "12px" }}>
                  {/* Total Outstanding */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 500 }}>Outstanding</span>
                    <span style={{ fontSize: "18px", fontWeight: 700, color: outstanding > 0 ? "var(--danger)" : "var(--text-primary)" }}>
                      {formatCurrency(outstanding)}
                    </span>
                  </div>

                  {/* Current Due — only when statement_day is set */}
                  {account.statement_day && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 500 }}>Current Due</span>
                      {account.currentDuePaid ? (
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--success)" }}>Paid ✓</span>
                      ) : (
                        <span style={{ fontSize: "13px", fontWeight: 600, color: (account.currentDue || 0) > 0 ? "var(--danger)" : "var(--text-secondary)" }}>
                          {formatCurrency(account.currentDue || 0)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Unbilled — only when statement_day is set */}
                  {account.statement_day && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 500 }}>Unbilled</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: (account.unbilled || 0) > 0 ? "var(--warning)" : "var(--text-secondary)" }}>
                        {formatCurrency(account.unbilled || 0)}
                      </span>
                    </div>
                  )}

                  {/* Available credit */}
                  {available !== null && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 500 }}>Available</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--success)" }}>
                        {formatCurrency(available)}
                      </span>
                    </div>
                  )}
                  {limit > 0 && (
                    <div style={{ textAlign: "right", fontSize: "10px", color: "var(--text-tertiary)" }}>
                      Limit: {formatCurrency(limit)}
                    </div>
                  )}
                </div>

                {/* Utilization Bar */}
                {utilPct !== null && (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{
                      height: "5px",
                      borderRadius: "3px",
                      background: "var(--border)",
                      overflow: "hidden",
                      marginBottom: "4px",
                    }}>
                      <div style={{
                        height: "100%",
                        borderRadius: "3px",
                        width: `${Math.min(utilPct, 100)}%`,
                        background: utilizationColor,
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                    <div style={{ textAlign: "right", fontSize: "10px", color: utilizationColor, fontWeight: 600 }}>
                      {utilPct}% used
                    </div>
                  </div>
                )}

                {/* Due Date Badge */}
                {daysUntilDue !== null && (
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 8px",
                      borderRadius: "20px",
                      background: getDueBg(daysUntilDue),
                      fontSize: "11px",
                      fontWeight: 600,
                      color: getDueColor(daysUntilDue),
                    }}>
                      {daysUntilDue <= 0
                        ? "⚠️ Due Today!"
                        : `📅 Due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}${
                          account.nextDueDateStr ? ` · ${account.nextDueDateStr}` : ""
                        }`
                      }
                    </div>
                    {minPayment > 0 && (
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                        Min. payment {formatCurrency(minPayment)}
                      </div>
                    )}
                  </div>
                )}

                {/* Pay Bill button */}
                {onPayBill && outstanding > 0 && (
                  <button
                    onClick={() => onPayBill(account)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "8px",
                      border: "1.5px solid var(--accent)",
                      background: "var(--accent-light)",
                      color: "var(--accent)",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "var(--accent)";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "var(--accent-light)";
                      e.currentTarget.style.color = "var(--accent)";
                    }}
                  >
                    💳 Pay Bill
                  </button>
                )}
              </div>
            );
          }

          // ── Standard bank/cash/savings/investment card ──
          return (
            <div key={account.id} className={styles.accountCard}>
              <div className={styles.accountIcon}>
                {getIcon(account.type)}
              </div>
              <div className={styles.accountName}>{account.name}</div>
              <div className={styles.accountBalance}>
                {account.balance < 0 ? "-" : ""}{formatCurrency(account.balance)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
