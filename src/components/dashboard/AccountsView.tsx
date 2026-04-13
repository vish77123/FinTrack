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

// Known bank email senders for quick-pick dropdown
const KNOWN_SENDERS = [
  { label: "HDFC Bank", value: "alerts@hdfcbank.net" },
  { label: "HDFC Credit Card", value: "creditcardalerts@hdfcbank.com" },
  { label: "SBI", value: "alerts@sbi.co.in" },
  { label: "ICICI Bank", value: "alerts@icicibank.com" },
  { label: "Axis Bank", value: "alerts@axisbank.com" },
  { label: "Kotak Bank", value: "alerts.service@kotak.com" },
  { label: "Yes Bank", value: "alerts@yesbank.in" },
  { label: "PNB", value: "alerts@pnb.co.in" },
  { label: "Paytm Bank", value: "noreply@paytmbank.com" },
  { label: "IndusInd Bank", value: "alerts@indusind.com" },
  { label: "Custom...", value: "__custom__" },
];

interface AlertFormState {
  emailSender: string;
  customSender: string;
  last4: string;
}

export default function AccountsView({ accounts, netWorth, currency, alertProfiles = [] }: AccountsViewProps) {
  const { setAddAccountModalOpen } = useUIStore();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingAccount, setEditingAccount] = useState<any>(null);

  // Separate contacts from regular accounts
  const bankAccounts = useMemo(() => accounts.filter(a => a.type !== 'contact'), [accounts]);
  const contactAccounts = useMemo(() => accounts.filter(a => a.type === 'contact'), [accounts]);
  const bankNetWorth = useMemo(() => bankAccounts.reduce((s, a) => s + Number(a.balance), 0), [bankAccounts]);
  const totalReceivable = useMemo(() => contactAccounts.reduce((s, a) => s + Number(a.balance), 0), [contactAccounts]);

  // Controls which account card has its alert section open
  const [openAlertId, setOpenAlertId] = useState<string | null>(null);
  const [alertForms, setAlertForms] = useState<Record<string, AlertFormState>>({});
  const [alertMsgs, setAlertMsgs] = useState<Record<string, string>>({});

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

  const toggleAlert = (accountId: string) => {
    if (openAlertId === accountId) {
      setOpenAlertId(null);
      return;
    }
    // Pre-fill from existing profile if present
    const existing = getProfile(accountId);
    if (existing && !alertForms[accountId]) {
      const isCustom = !KNOWN_SENDERS.some(s => s.value === existing.email_sender_filter && s.value !== "__custom__");
      setAlertForms(prev => ({
        ...prev,
        [accountId]: {
          emailSender: isCustom && existing.email_sender_filter ? "__custom__" : (existing.email_sender_filter || ""),
          customSender: isCustom ? (existing.email_sender_filter || "") : "",
          last4: existing.account_last4 || "",
        }
      }));
    }
    setOpenAlertId(accountId);
  };

  const updateForm = (accountId: string, field: keyof AlertFormState, value: string) => {
    setAlertForms(prev => ({
      ...prev,
      [accountId]: { ...((prev[accountId]) || { emailSender: "", customSender: "", last4: "" }), [field]: value }
    }));
  };

  const handleSaveAlert = (accountId: string) => {
    const form = alertForms[accountId] || { emailSender: "", customSender: "", last4: "" };
    const effectiveSender = form.emailSender === "__custom__" ? form.customSender : form.emailSender;

    const fd = new FormData();
    fd.append("account_id", accountId);
    fd.append("email_sender_filter", effectiveSender);
    fd.append("account_last4", form.last4);

    setAlertMsgs(prev => ({ ...prev, [accountId]: "Saving..." }));
    startTransition(async () => {
      const res = await saveAlertProfileAction(fd);
      if (res.error) {
        setAlertMsgs(prev => ({ ...prev, [accountId]: res.error! }));
      } else {
        setAlertMsgs(prev => ({ ...prev, [accountId]: "✓ Saved!" }));
        setTimeout(() => {
          setAlertMsgs(prev => ({ ...prev, [accountId]: "" }));
          setOpenAlertId(null);
          router.refresh();
        }, 1500);
      }
    });
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
          const isNegative = acc.balance < 0;
          const profile = getProfile(acc.id);
          const form = alertForms[acc.id] || { emailSender: "", customSender: "", last4: "" };
          const isAlertOpen = openAlertId === acc.id;

          return (
            <div key={acc.id} className={`${styles.accountCard} ${isAlertOpen ? styles.accountCardExpanded : ""}`}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>{getIcon(acc.type)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className={`${styles.cardBadge} ${getBadgeClass(acc.type)}`}>
                    {getBadgeText(acc.type)}
                  </div>
                  <button
                    className={styles.editBtn}
                    onClick={(e) => { e.stopPropagation(); setEditingAccount(acc); }}
                    title="Edit Account"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </div>

              <div className={`${styles.cardAmount} ${isNegative ? styles.negative : ""}`}>
                {isNegative ? `− ${formatCurrency(acc.balance, true)}` : formatCurrency(acc.balance)}
              </div>
              <div className={styles.cardName}>{acc.name}</div>

              <div className={styles.cardDivider}></div>

              {/* Dynamic stats */}
              <div className={styles.cardStats}>
                {acc.type === "credit_card" ? (
                  <>
                    <div className={styles.statItem}>Spent: <span className={styles.statValue}>{formatCurrency(acc.balance, true)}</span></div>
                    <div className={styles.statItem}>Limit: <span className={styles.statValue}>{formatCurrency(150000)}</span></div>
                  </>
                ) : (
                  <>
                    <div className={styles.statItem}>Type: <span className={styles.statValue}>{getBadgeText(acc.type)}</span></div>
                    <div className={styles.statItem}>Balance: <span className={styles.statValue}>{formatCurrency(acc.balance)}</span></div>
                  </>
                )}
              </div>

              {/* EMAIL ALERT PROFILE SECTION */}
              <div className={styles.alertSection}>
                <button
                  className={styles.alertToggle}
                  onClick={() => toggleAlert(acc.id)}
                >
                  <div className={styles.alertToggleLeft}>
                    <Mail size={14} />
                    <span>Email Alert Profile</span>
                    {profile && (
                      <span className={styles.alertConfigured}>Configured</span>
                    )}
                  </div>
                  {isAlertOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {isAlertOpen && (
                  <div className={styles.alertPanel}>
                    <p className={styles.alertHint}>
                      Link this account to your bank's email alerts so transactions can be auto-detected.
                    </p>

                    {/* Bank sender picker */}
                    <div className={styles.alertField}>
                      <label className={styles.alertLabel}>Bank Email Sender</label>
                      <select
                        className={styles.alertInput}
                        value={form.emailSender}
                        onChange={e => updateForm(acc.id, "emailSender", e.target.value)}
                      >
                        <option value="">Select your bank…</option>
                        {KNOWN_SENDERS.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Custom sender input */}
                    {form.emailSender === "__custom__" && (
                      <div className={styles.alertField}>
                        <label className={styles.alertLabel}>Custom Sender Email</label>
                        <input
                          type="email"
                          className={styles.alertInput}
                          placeholder="e.g. alerts@mybank.com"
                          value={form.customSender}
                          onChange={e => updateForm(acc.id, "customSender", e.target.value)}
                        />
                      </div>
                    )}

                    {/* Last 4 digits */}
                    <div className={styles.alertField}>
                      <label className={styles.alertLabel}>Account Last 4 Digits</label>
                      <input
                        type="text"
                        className={styles.alertInput}
                        placeholder="e.g. 1234"
                        maxLength={4}
                        value={form.last4}
                        onChange={e => updateForm(acc.id, "last4", e.target.value.replace(/\D/g, ""))}
                      />
                      <span className={styles.alertInputHint}>Used to match SMS/email to this account</span>
                    </div>

                    {/* Feedback */}
                    {alertMsgs[acc.id] && (
                      <div className={styles.alertMsg} style={{
                        color: alertMsgs[acc.id].startsWith("✓") ? "var(--success)" : "var(--danger)"
                      }}>
                        {alertMsgs[acc.id]}
                      </div>
                    )}

                    {/* Actions */}
                    <div className={styles.alertActions}>
                      <button
                        className={styles.alertBtnCancel}
                        onClick={() => setOpenAlertId(null)}
                        disabled={isPending}
                      >
                        <X size={13} /> Cancel
                      </button>
                      <button
                        className={styles.alertBtnSave}
                        onClick={() => handleSaveAlert(acc.id)}
                        disabled={isPending}
                      >
                        <Check size={13} /> Save Profile
                      </button>
                    </div>
                  </div>
                )}
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

      {/* Edit Account Modal */}
      <EditAccountModal
        isOpen={!!editingAccount}
        onClose={() => setEditingAccount(null)}
        account={editingAccount}
      />
    </div>
  );
}
