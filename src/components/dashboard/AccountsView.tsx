"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";
import { Plus, Pencil, Mail, ChevronDown, ChevronUp, Check, X, UserPlus, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { EditAccountModal } from "@/components/ui/EditAccountModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Landmark } from "lucide-react";
import { saveAlertProfileAction } from "@/app/actions/gmail";
import styles from "./accounts.module.css";

interface AccountsViewProps {
  accounts: any[];
  netWorth: number;
  currency: string;
  alertProfiles?: any[];
}

export default function AccountsView({ accounts, netWorth, currency, alertProfiles = [] }: AccountsViewProps) {
  const { setAddAccountModalOpen, setTransactionModalOpen } = useUIStore();
  const router = useRouter();
  const [editingAccount, setEditingAccount] = useState<any>(null);

  // Separate contacts from regular accounts
  const bankAccounts = useMemo(() => accounts.filter(a => a.type !== 'contact'), [accounts]);
  const contactAccounts = useMemo(() => accounts.filter(a => a.type === 'contact'), [accounts]);
  const bankNetWorth = useMemo(() => bankAccounts.reduce((s, a) => {
    if (a.type === 'credit_card') return s - (Number(a.outstanding_balance) || 0);
    return s + Number(a.balance);
  }, 0), [bankAccounts]);
  const totalReceivable = useMemo(() => contactAccounts.reduce((s, a) => s + Number(a.balance), 0), [contactAccounts]);

  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);

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

  const formatCurrency = (amount: number, forcePositive = false) => {
    const val = amount || 0;
    return `${currency}${forcePositive ? Math.abs(val).toLocaleString("en-IN") : val.toLocaleString("en-IN")}`;
  };

  const getIcon = (type: string) => {
    switch(type) {
      case "bank": return "🏦";
      case "credit_card": return "💳";
      case "cash": return "💵";
      case "investment": return "📈";
      case "savings": return "🏦";
      case "contact": return "👤";
      default: return "🏦";
    }
  };

  const getBadgeClass = (type: string) => {
    switch(type) {
      case "bank": return styles.badgeBank;
      case "credit_card": return styles.badgeCredit;
      case "cash": return styles.badgeCash;
      case "contact": return styles.badgeContact;
      default: return styles.badgeBank;
    }
  };

  const getBadgeText = (type: string) => {
    switch(type) {
      case "bank": return "Bank";
      case "credit_card": return "Credit";
      case "cash": return "Cash";
      case "investment": return "Investment";
      case "savings": return "Savings";
      case "contact": return "Contact";
      default: return "Account";
    }
  };

  // Get existing alert profile for an account
  const getProfile = (accountId: string) =>
    alertProfiles.find((p: any) => p.account_id === accountId);

  const handlePayBill = (ccAccount: any) => {
    window.dispatchEvent(new CustomEvent("fintrack:paybill", {
      detail: {
        transferTo: ccAccount.id,
        amount: ccAccount.currentDue ?? ccAccount.outstanding_balance ?? 0,
        ccName: ccAccount.name,
      }
    }));
    setTransactionModalOpen(true);
    setSelectedAccount(null);
  };

  return (
    <div className={styles.container}>
      {/* HEADER SECTION */}
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Accounts</h1>
          <p className={styles.pageSubtitle}>Manage your bank accounts, cards, and wallets</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAddAccountModalOpen(true)}>
          <Plus size={16} /> Add Account
        </button>
      </div>

      {/* HERO BANNER - Total Net Worth */}
      {accounts.length > 0 && (
        <div className={styles.heroBanner}>
          <div className={styles.heroLabel}>
            <span className={styles.heroLabelSpan}></span> Total Net Worth
          </div>
          <div className={styles.heroAmount}>{formatCurrency(bankNetWorth)}</div>
          <div className={styles.heroSubtext}>
            Across {bankAccounts.length} account{bankAccounts.length !== 1 ? "s" : ""}
            {contactAccounts.length > 0 && (
              <span style={{ marginLeft: '12px', padding: '2px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.15)', fontSize: '12px' }}>
                {totalReceivable >= 0 
                  ? `+${formatCurrency(totalReceivable)} receivable`
                  : `${formatCurrency(totalReceivable)} payable`
                }
              </span>
            )}
          </div>
        </div>
      )}

      {/* ACCOUNTS GRID OR EMPTY STATE */}
      {accounts.length === 0 ? (
        <div style={{ marginTop: '48px' }}>
          <EmptyState 
            icon={<Landmark size={48} />}
            title="No accounts found"
            description="Add your bank accounts, credit cards, or cash wallets to get started."
            actionLabel="Add Account"
            onAction={() => setAddAccountModalOpen(true)}
          />
        </div>
      ) : (
        <>
        {/* ========== BANK ACCOUNTS SECTION ========== */}
        <div className={styles.cardsGrid}>
        
        {bankAccounts.map((acc: any) => {
          if (acc.type === 'credit_card') {
            const outstanding = Number(acc.outstanding_balance) || 0;
            const limit       = Number(acc.credit_limit) || 0;
            const utilPct     = acc.utilizationPct ?? (limit > 0 ? Math.round((outstanding / limit) * 100 * 10) / 10 : null);
            const daysUntilDue = acc.daysUntilDue ?? null;
            const utilColor = utilPct !== null && utilPct > 80 ? "#FF4757" : (utilPct !== null && utilPct > 50 ? "#F5A623" : "#10B981");

            return (
              <div key={acc.id} className={styles.accountCard} onClick={() => setSelectedAccount(acc)} style={{
                ...getCardStyle(acc.name, acc.type),
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
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 60%)", pointerEvents: "none" }} />
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative", zIndex: 1 }}>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.5px", color: "#fff" }}>{acc.name}</div>
                    <div style={{ fontSize: "11px", opacity: 0.8, marginTop: "2px", color: "#fff" }}>Credit Card</div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button onClick={(e) => { e.stopPropagation(); setEditingAccount(acc); }} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", padding: "6px", borderRadius: "10px", cursor: "pointer", zIndex: 2 }}>
                      <Pencil size={14} />
                    </button>
                    <div style={{ opacity: 0.9, color: "#fff", fontSize: "20px" }}>💳</div>
                  </div>
                </div>

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

                <div style={{ position: "relative", zIndex: 1, color: "#fff" }}>
                   <div style={{ width: "100%", height: "4px", background: "rgba(0,0,0,0.3)", borderRadius: "2px", marginBottom: "6px" }}>
                      <div style={{ width: `${Math.min(utilPct || 0, 100)}%`, height: "100%", background: utilColor, borderRadius: "2px" }} />
                   </div>
                   <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", opacity: 0.8, fontWeight: 500 }}>
                     <span>{utilPct !== null ? `${utilPct}% used` : "Credit limit"}</span>
                     <span>
                        {acc.statement_day && !acc.currentDuePaid && (acc.currentDue || 0) > 0 
                          ? `Due: ${formatCurrency(acc.currentDue)}` 
                          : acc.currentDuePaid ? "Paid ✓" : ""}
                     </span>
                   </div>
                </div>
              </div>
            );
          }

          // ── STANDARD BANK / CASH / SAVINGS / INVESTMENT CARD ─────
          return (
              <div key={acc.id} className={styles.accountCard} onClick={() => setSelectedAccount(acc)} style={{
                ...getCardStyle(acc.name, acc.type),
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
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 60%)", pointerEvents: "none" }} />
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative", zIndex: 1 }}>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.5px", color: "#fff" }}>{acc.name}</div>
                    <div style={{ fontSize: "11px", opacity: 0.8, marginTop: "2px", textTransform: "capitalize", color: "#fff" }}>{acc.type.replace('_', ' ')}</div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button onClick={(e) => { e.stopPropagation(); setEditingAccount(acc); }} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", padding: "6px", borderRadius: "10px", cursor: "pointer", zIndex: 2 }}>
                      <Pencil size={14} />
                    </button>
                    <div style={{ opacity: 0.9, color: "#fff", fontSize: "20px" }}>{getIcon(acc.type)}</div>
                  </div>
                </div>

                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ fontSize: "10px", opacity: 0.8, marginBottom: "4px", fontWeight: 600, letterSpacing: "0.5px", color: "#fff" }}>AVAILABLE BALANCE</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1, color: "#fff" }}>
                    {acc.balance < 0 ? "-" : ""}{formatCurrency(acc.balance)}
                  </div>
                </div>
              </div>
          );
        })}

        {/* ADD NEW CARD ELEMENT */}
        <div className={styles.addNewCard} onClick={() => setAddAccountModalOpen(true)}>
          <Plus size={24} />
          <span>Add New Account</span>
        </div>
        </div>

        {/* ========== CONTACTS SECTION ========== */}
        {contactAccounts.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  👥 People & Contacts
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Track who owes you and who you owe — your built-in Splitwise
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setAddAccountModalOpen(true)}
                style={{ gap: '6px' }}
              >
                <UserPlus size={14} />
                Add Contact
              </button>
            </div>

            <div className={styles.cardsGrid}>
              {contactAccounts.map((acc: any) => {
                const balance = Number(acc.balance);
                const isPositive = balance > 0;
                const isZero = Math.abs(balance) < 0.01;

                return (
                  <div key={acc.id} className={styles.accountCard} style={{
                    borderColor: isZero ? 'var(--border)' : isPositive ? 'var(--success)' : 'var(--danger)',
                    borderWidth: isZero ? '1px' : '1.5px',
                  }}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardIcon} style={{
                        background: isPositive ? 'var(--success-light)' : isZero ? 'var(--bg)' : 'var(--danger-light)',
                        fontSize: '20px',
                      }}>
                        👤
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className={`${styles.cardBadge} ${styles.badgeContact}`}>
                          Contact
                        </div>
                        <button
                          className={styles.editBtn}
                          onClick={(e) => { e.stopPropagation(); setEditingAccount(acc); }}
                          title="Edit Contact"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </div>

                    <div className={styles.cardName} style={{ marginBottom: '8px', fontSize: '16px', fontWeight: 600 }}>{acc.name}</div>

                    {isZero ? (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        background: 'var(--bg)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        fontWeight: 500,
                      }}>
                        ✅ All settled up!
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 12px',
                        background: isPositive ? 'var(--success-light)' : 'var(--danger-light)',
                        borderRadius: '10px',
                      }}>
                        {isPositive ? (
                          <ArrowDownLeft size={16} style={{ color: 'var(--success)' }} />
                        ) : (
                          <ArrowUpRight size={16} style={{ color: 'var(--danger)' }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.5px',
                            color: isPositive ? 'var(--success)' : 'var(--danger)',
                            marginBottom: '2px',
                          }}>
                            {isPositive ? 'Owes You' : 'You Owe'}
                          </div>
                          <div style={{
                            fontSize: '18px',
                            fontWeight: 700,
                            color: isPositive ? 'var(--success)' : 'var(--danger)',
                          }}>
                            {formatCurrency(Math.abs(balance))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add new contact card */}
              <div className={styles.addNewCard} onClick={() => setAddAccountModalOpen(true)}>
                <UserPlus size={20} />
                <span>Add Contact</span>
              </div>
            </div>
          </div>
        )}
        </>
      )}

      {/* Account Details & Email Alert Modal */}
      {selectedAccount && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          overflowY: "auto", padding: "20px"
        }} onClick={() => setSelectedAccount(null)}>
          <div style={{
            background: "var(--surface)", width: "100%", maxWidth: "440px",
            borderRadius: "20px", padding: "24px", boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
            position: "relative",
            maxHeight: "90vh", overflowY: "auto"
          }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setSelectedAccount(null)}
              style={{ position: "absolute", top: "20px", right: "20px", background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "var(--text-tertiary)" }}
            >✕</button>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", paddingRight: "30px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: getCardStyle(selectedAccount.name, selectedAccount.type).background, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "24px", flexShrink: 0 }}>
                {selectedAccount.type === 'credit_card' ? '💳' : getIcon(selectedAccount.type)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{selectedAccount.name}</div>
                <div style={{ fontSize: "13px", color: "var(--text-tertiary)", textTransform: "capitalize" }}>{selectedAccount.type.replace('_', ' ')}</div>
              </div>
            </div>

            {/* Data Body */}
            {selectedAccount.type === "credit_card" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Outstanding Balance</span>
                  <span style={{ fontWeight: 700, fontSize: "16px", color: selectedAccount.outstanding_balance > 0 ? "var(--danger)" : "var(--text-primary)" }}>{formatCurrency(selectedAccount.outstanding_balance || 0)}</span>
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
                {/* Pay Bill button */}
                <button className="btn btn-primary" style={{ width: "100%", padding: "12px", fontSize: "16px", marginTop: "16px", display: "flex", justifyContent: "center" }} onClick={() => handlePayBill(selectedAccount)}>
                  Pay Bill
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "32px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Available Balance</span>
                  <span style={{ fontWeight: 700, fontSize: "18px", color: "var(--text-primary)" }}>{formatCurrency(selectedAccount.balance)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      <EditAccountModal
        isOpen={!!editingAccount}
        onClose={() => setEditingAccount(null)}
        account={editingAccount}
        alertProfile={editingAccount ? getProfile(editingAccount.id) : null}
      />
    </div>
  );
}
