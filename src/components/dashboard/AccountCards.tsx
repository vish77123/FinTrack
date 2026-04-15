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
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);

  const formatCurrency = (amount: number) => {
    return `${currency}${Math.abs(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "bank": return <Landmark size={18} />;
      case "credit_card": return <CreditCard size={18} />;
      case "investment": return <PieChart size={18} />;
      case "savings": return <Banknote size={18} />;
      case "cash": return <Wallet size={18} />;
      case "contact": return <User size={18} />;
      default: return <Landmark size={18} />;
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

  const getCardStyle = (name: string, type: string) => {
    const n = name.toLowerCase();
    if (n.includes("amex") || n.includes("american express")) return { background: "linear-gradient(135deg, #006FCF 0%, #004B8D 100%)", color: "#fff" };
    if (n.includes("axis")) return { background: "linear-gradient(135deg, #AE275F 0%, #7A123D 100%)", color: "#fff" };
    if (n.includes("hdfc")) return { background: "linear-gradient(135deg, #0A2351 0%, #041029 100%)", color: "#fff" };
    if (n.includes("icici")) return { background: "linear-gradient(135deg, #F05A28 0%, #C43D0F 100%)", color: "#fff" };
    if (n.includes("idfc")) return { background: "linear-gradient(135deg, #991B1B 0%, #7F1D1D 100%)", color: "#fff" };
    if (n.includes("sbi")) return { background: "linear-gradient(135deg, #00B1EB 0%, #0087B3 100%)", color: "#fff" };
    if (type === "cash") return { background: "linear-gradient(135deg, #10B981 0%, #047857 100%)", color: "#fff" };
    if (type === "savings") return { background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)", color: "#fff" };
    return { background: "linear-gradient(135deg, #374151 0%, #1F2937 100%)", color: "#fff" };
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
              <div key={account.id} className={styles.accountCard} onClick={() => setSelectedAccount(account)} style={{
                ...getCardStyle(account.name, account.type),
                minWidth: "260px",
                height: "160px",
                borderRadius: "16px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                overflow: "hidden",
                border: "none",
                color: "#fff",
                cursor: "pointer"
              }}>
                {/* Glossy Overlay */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 60%)", pointerEvents: "none" }} />
                
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative", zIndex: 1 }}>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.5px", color: "#fff" }}>{account.name}</div>
                    <div style={{ fontSize: "11px", opacity: 0.8, marginTop: "2px", color: "#fff" }}>Credit Card</div>
                  </div>
                  <div style={{ opacity: 0.9, color: "#fff" }}><CreditCard size={20} /></div>
                </div>

                {/* Body/Balance */}
                <div style={{ position: "relative", zIndex: 1, marginTop: "auto", marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: "10px", opacity: 0.8, marginBottom: "2px", fontWeight: 600, letterSpacing: "0.5px", color: "#fff" }}>OUTSTANDING</div>
                      <div style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1, color: "#fff" }}>
                        {formatCurrency(outstanding)}
                      </div>
                    </div>
                    {daysUntilDue !== null && daysUntilDue <= 15 && (
                      <div style={{ fontSize: "10px", background: daysUntilDue <= 5 ? "#EF4444" : "#F59E0B", color: "white", padding: "3px 8px", borderRadius: "10px", fontWeight: 600, boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>
                        {daysUntilDue <= 0 ? "Due Today" : `Due in ${daysUntilDue}d`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Limit & Due */}
                <div style={{ position: "relative", zIndex: 1, color: "#fff" }}>
                   <div style={{ width: "100%", height: "4px", background: "rgba(0,0,0,0.3)", borderRadius: "2px", marginBottom: "6px" }}>
                      <div style={{ width: `${Math.min(utilPct || 0, 100)}%`, height: "100%", background: utilPct !== null && utilPct > 80 ? "#FF4757" : (utilPct !== null && utilPct > 50 ? "#F5A623" : "#10B981"), borderRadius: "2px" }} />
                   </div>
                   <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", opacity: 0.8, fontWeight: 500 }}>
                     <span>{utilPct !== null ? `${utilPct}% used` : "Credit limit"}</span>
                     <span>
                        {account.statement_day && !account.currentDuePaid && (account.currentDue || 0) > 0 
                          ? `Due: ${formatCurrency(account.currentDue)}` 
                          : account.currentDuePaid ? "Paid ✓" : ""}
                     </span>
                   </div>
                </div>
              </div>
            );
          }

          // ── Standard bank/cash/savings/investment card ──
          return (
              <div key={account.id} className={styles.accountCard} onClick={() => setSelectedAccount(account)} style={{
                ...getCardStyle(account.name, account.type),
                minWidth: "260px",
                height: "160px",
                borderRadius: "16px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                overflow: "hidden",
                border: "none",
                color: "#fff"
              }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 60%)", pointerEvents: "none" }} />
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative", zIndex: 1 }}>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.5px", color: "#fff" }}>{account.name}</div>
                    <div style={{ fontSize: "11px", opacity: 0.8, marginTop: "2px", textTransform: "capitalize", color: "#fff" }}>{account.type.replace('_', ' ')}</div>
                  </div>
                  <div style={{ opacity: 0.9, color: "#fff" }}>{getIcon(account.type)}</div>
                </div>

                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ fontSize: "10px", opacity: 0.8, marginBottom: "4px", fontWeight: 600, letterSpacing: "0.5px", color: "#fff" }}>AVAILABLE BALANCE</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1, color: "#fff" }}>
                    {account.balance < 0 ? "-" : ""}{formatCurrency(account.balance)}
                  </div>
                </div>
              </div>
          );
        })}
      </div>

      {selectedAccount && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
        }} onClick={() => setSelectedAccount(null)}>
          <div style={{
            background: "var(--surface)", width: "90%", maxWidth: "400px",
            borderRadius: "20px", padding: "24px", boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
            position: "relative"
          }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setSelectedAccount(null)}
              style={{ position: "absolute", top: "20px", right: "20px", background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "var(--text-tertiary)" }}
            >✕</button>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: getCardStyle(selectedAccount.name, selectedAccount.type).background, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                {getIcon(selectedAccount.type)}
              </div>
              <div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{selectedAccount.name}</div>
                <div style={{ fontSize: "13px", color: "var(--text-tertiary)", textTransform: "capitalize" }}>{selectedAccount.type.replace('_', ' ')}</div>
              </div>
            </div>

            {selectedAccount.type === "credit_card" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Outstanding Balance</span>
                  <span style={{ fontWeight: 700, fontSize: "16px", color: "var(--danger)" }}>{formatCurrency(selectedAccount.outstanding_balance || 0)}</span>
                </div>
                {selectedAccount.statement_day && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Current Due</span>
                      <span style={{ fontWeight: 700, fontSize: "16px", color: selectedAccount.currentDuePaid ? "var(--success)" : "var(--text-primary)" }}>
                        {selectedAccount.currentDuePaid ? "Paid ✓" : formatCurrency(selectedAccount.currentDue || 0)}
                      </span>
                    </div>
                    {selectedAccount.nextDueDateStr && (
                      <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Due Date</span>
                        <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>{selectedAccount.nextDueDateStr}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Unbilled</span>
                      <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--warning)" }}>{formatCurrency(selectedAccount.unbilled || 0)}</span>
                    </div>
                  </>
                )}
                {selectedAccount.credit_limit > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Available Limit</span>
                    <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--success)" }}>
                      {formatCurrency(selectedAccount.availableCredit ?? Math.max(0, selectedAccount.credit_limit - (selectedAccount.outstanding_balance || 0)))}
                    </span>
                  </div>
                )}
                
                {onPayBill && (selectedAccount.outstanding_balance || 0) > 0 && (
                  <button onClick={() => { setSelectedAccount(null); onPayBill(selectedAccount); }} style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "var(--accent)", color: "white", border: "none", fontWeight: 600, fontSize: "14px", cursor: "pointer", marginTop: "8px" }}>
                    💳 Pay Bill
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Available Balance</span>
                  <span style={{ fontWeight: 700, fontSize: "18px", color: "var(--text-primary)" }}>{formatCurrency(selectedAccount.balance)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
