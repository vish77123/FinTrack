"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { 
  User, DollarSign, Moon, Sun, Monitor, Tag, Download, LogOut,
  Check, X, Pencil, Save, Mail, Zap, Bot, RefreshCw, Clock, Key, Sparkles, Eye, EyeOff, AlertTriangle,
  Smartphone, Copy, ChevronDown, ChevronUp, RotateCcw
} from "lucide-react";
import styles from "@/components/dashboard/settings.module.css";
import { useUIStore } from "@/store/useUIStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { 
  updateProfileAction, 
  exportAllTransactionsAction, 
  getUserProfileAction, 
  updateCurrencyAction,
  resetUserAccountAction
} from "@/app/actions/settings";
import {
  syncGmailAction,
  getGmailStatusAction,
  updateEmailSyncSettingsAction
} from "@/app/actions/gmail";
import { 
  getMerchantRulesAction, 
  deleteMerchantRuleAction 
} from "@/app/actions/merchantRulesActions";
import {
  regenerateWebhookSecretAction
} from "@/app/actions/sms";

const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee (₹)" },
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
  { code: "EUR", symbol: "€", label: "Euro (€)" },
  { code: "GBP", symbol: "£", label: "British Pound (£)" },
];

type ThemeMode = "light" | "dark" | "system";

export function SettingsClient() {
  const { theme, setTheme, setCategoryManagerModalOpen } = useUIStore();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Profile state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  // Currency state
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState("INR");

  // Theme state
  const [themeMode, setThemeMode] = useState<ThemeMode>(theme === "dark" ? "dark" : "light");
  const [showThemePicker, setShowThemePicker] = useState(false);

  // Export & Reset state
  const [exportMsg, setExportMsg] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Gmail sync state
  const [gmailStatus, setGmailStatus] = useState<any>(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [regexEnabled, setRegexEnabled] = useState(true);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [syncInterval, setSyncInterval] = useState(60);
  const [aiProvider, setAiProvider] = useState<"gemini" | "bytez">("gemini");

  // SMS forwarding state
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [smsCopied, setSmsCopied] = useState(false);
  const [smsGuideOpen, setSmsGuideOpen] = useState(false);
  const [smsRegenerateMsg, setSmsRegenerateMsg] = useState("");

  // Load profile on mount
  useEffect(() => {
    getUserProfileAction().then((res) => {
      if (res.success) {
        setDisplayName(res.displayName || "");
        setEmail(res.email || "");
        setSelectedCurrency(res.currencyCode || "INR");
        setWebhookSecret((res as any).webhookSecret || null);
        setProfileLoaded(true);
      }
    });
    getGmailStatusAction().then((res) => {
      setGmailStatus(res);
      if (res.settings) {
        setApprovalRequired(res.settings.approval_required ?? true);
        setRegexEnabled(res.settings.regex_enabled ?? true);
        setLlmEnabled(res.settings.llm_enabled ?? false);
        setSyncInterval(res.settings.sync_interval_minutes ?? 60);
        setAiProvider(res.settings.selected_llm_provider || "gemini");
      }
    });
  }, []);

  // Handle theme changes
  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    setShowThemePicker(false);
    if (mode === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    } else {
      setTheme(mode);
    }
    document.documentElement.setAttribute("data-theme", mode === "system" 
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") 
      : mode
    );
  };

  // Handle profile save
  const handleProfileSave = () => {
    setProfileMsg("");
    const formData = new FormData();
    formData.append("display_name", displayName);

    startTransition(async () => {
      const res = await updateProfileAction(formData);
      if (res.error) {
        setProfileMsg(res.error);
      } else {
        setProfileMsg("Profile updated!");
        setIsEditingProfile(false);
        setTimeout(() => setProfileMsg(""), 3000);
      }
    });
  };

  // Handle currency change
  const handleCurrencyChange = (code: string) => {
    setSelectedCurrency(code);
    setShowCurrencyPicker(false);

    startTransition(async () => {
      await updateCurrencyAction(code);
    });
  };

  // Handle export
  const handleExport = () => {
    setExportMsg("Exporting...");
    startTransition(async () => {
      const res = await exportAllTransactionsAction();
      if (res.error) {
        setExportMsg(res.error);
      } else if (res.csv) {
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `fintrack_export_${new Date().toISOString().split("T")[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setExportMsg("Export downloaded!");
        setTimeout(() => setExportMsg(""), 3000);
      }
    });
  };

  const handleResetAccountClick = () => {
    setIsResetConfirmOpen(true);
  };

  const handleResetAccountConfirm = () => {
    setIsResetConfirmOpen(false);
    setResetMsg("Resetting account...");
    startTransition(async () => {
      const res = await resetUserAccountAction();
      if (res.error) {
        setResetMsg(`Error: ${res.error}`);
      } else {
        setResetMsg("Account reset successfully. Redirecting...");
        // The action revalidates the layout, we should refresh the router.
        router.push("/dashboard");
        router.refresh();
      }
    });
  };

  const currentCurrency = CURRENCIES.find(c => c.code === selectedCurrency) || CURRENCIES[0];
  const themeLabel = themeMode === "system" ? "System" : themeMode === "dark" ? "Dark" : "Light";

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1>Settings</h1>
        <p>Customize your Money Manager experience</p>
      </div>

      <div className={styles.settingsGrid}>
        
        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <div className={styles.settingsSection}>
            <div className={styles.sectionTitle}>GENERAL</div>
            <div className={styles.listBlock}>

              {/* PROFILE */}
              <div className={styles.listItem} onClick={() => !isEditingProfile && setIsEditingProfile(true)}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.blue}`}><User size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Profile</div>
                    <div className={styles.itemSubtitle}>
                      {profileLoaded ? (email || "Your account") : "Loading..."}
                    </div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <Pencil size={16} />
                </div>
              </div>

              {isEditingProfile && (
                <div className={styles.expandedPanel}>
                  {profileMsg && (
                    <div style={{ 
                      padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "12px",
                      background: profileMsg.includes("error") || profileMsg.includes("Failed") 
                        ? "var(--danger-light)" : "var(--success-light)",
                      color: profileMsg.includes("error") || profileMsg.includes("Failed") 
                        ? "var(--danger)" : "var(--success)"
                    }}>
                      {profileMsg}
                    </div>
                  )}
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                      Display Name
                    </label>
                    <input type="text" className="form-input" value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button className="btn btn-secondary" onClick={() => setIsEditingProfile(false)}
                      disabled={isPending} style={{ fontSize: "13px", padding: "8px 16px" }}>
                      <X size={14} /> Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleProfileSave}
                      disabled={isPending} style={{ fontSize: "13px", padding: "8px 16px" }}>
                      <Save size={14} /> {isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {/* CURRENCY */}
              <div className={styles.listItem} onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.green}`}><DollarSign size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Currency</div>
                    <div className={styles.itemSubtitle}>{currentCurrency.label}</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <span style={{ fontSize: "13px", color: "var(--accent)", fontWeight: 500 }}>
                    {currentCurrency.symbol}
                  </span>
                </div>
              </div>
              {showCurrencyPicker && (
                <div className={styles.expandedPanel}>
                  {CURRENCIES.map(cur => (
                    <button key={cur.code}
                      className={`${styles.optionBtn} ${selectedCurrency === cur.code ? styles.optionActive : ""}`}
                      onClick={() => handleCurrencyChange(cur.code)}>
                      <span style={{ fontSize: "18px" }}>{cur.symbol}</span>
                      <span>{cur.label}</span>
                      {selectedCurrency === cur.code && <Check size={16} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
                    </button>
                  ))}
                </div>
              )}

              {/* APPEARANCE */}
              <div className={styles.listItem} onClick={() => setShowThemePicker(!showThemePicker)}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.purple}`}>
                    {themeMode === "dark" ? <Moon size={18} /> : themeMode === "light" ? <Sun size={18} /> : <Monitor size={18} />}
                  </div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Appearance</div>
                    <div className={styles.itemSubtitle}>{themeLabel} mode</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{themeLabel}</span>
                </div>
              </div>
              {showThemePicker && (
                <div className={styles.expandedPanel}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {([
                      { mode: "light" as ThemeMode, icon: <Sun size={16} />, label: "Light" },
                      { mode: "dark" as ThemeMode, icon: <Moon size={16} />, label: "Dark" },
                      { mode: "system" as ThemeMode, icon: <Monitor size={16} />, label: "System" },
                    ]).map(opt => (
                      <button key={opt.mode}
                        className={`${styles.themeBtn} ${themeMode === opt.mode ? styles.themeBtnActive : ""}`}
                        onClick={() => handleThemeChange(opt.mode)}>
                        {opt.icon}
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* CATEGORIES */}
              <div className={styles.listItem} onClick={() => setCategoryManagerModalOpen(true)}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.orange}`}><Tag size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Categories</div>
                    <div className={styles.itemSubtitle}>Manage expense & income categories</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>→</span>
                </div>
              </div>

            </div>
          </div>

          {/* AUTO-CATEGORIZATION RULES SECTION */}
          <div className={styles.settingsSection}>
            <div className={styles.sectionTitle}>AUTO-CATEGORIZATION</div>
            <div className={styles.listBlock}>
              <MerchantRulesPanel isPending={isPending} startTransition={startTransition} />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>

          {/* GMAIL SYNC SECTION */}
          <div className={styles.settingsSection}>
            <div className={styles.sectionTitle}>GMAIL SYNC</div>
            <div className={styles.listBlock}>

              {/* Connection status */}
              <div className={styles.listItem}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.blue}`}><Mail size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Gmail Connection</div>
                    <div className={styles.itemSubtitle}>
                      {gmailStatus?.connected ? gmailStatus.email : "Not connected — sign in with Google"}
                    </div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: gmailStatus?.connected ? "var(--success)" : "var(--text-tertiary)" }}>
                    {gmailStatus?.connected ? "● Connected" : "○ Disconnected"}
                  </span>
                </div>
              </div>

              {/* Sync Now */}
              {gmailStatus?.connected && (
                <div className={styles.listItem} onClick={() => {
                  setSyncMsg("Syncing...");
                  startTransition(async () => {
                    const res = await syncGmailAction();
                    if (res.error) { setSyncMsg(res.error); }
                    else { setSyncMsg(`Synced! ${res.newTransactions} new, ${res.skipped} skipped`); router.refresh(); }
                    setTimeout(() => setSyncMsg(""), 5000);
                  });
                }}>
                  <div className={styles.itemLeft}>
                    <div className={`${styles.iconWrap} ${styles.green}`}>
                      <RefreshCw size={18} className={isPending ? "spin" : ""} />
                    </div>
                    <div className={styles.itemText}>
                      <div className={styles.itemTitle}>Sync Now</div>
                      <div className={styles.itemSubtitle}>
                        {syncMsg || (gmailStatus?.lastSync ? `Last: ${new Date(gmailStatus.lastSync).toLocaleString()}` : "Never synced")}
                      </div>
                    </div>
                  </div>
                  <div className={styles.itemRight}><RefreshCw size={16} /></div>
                </div>
              )}

              {/* Approval Required toggle */}
              <div className={styles.listItem} onClick={() => {
                const newVal = !approvalRequired;
                setApprovalRequired(newVal);
                const fd = new FormData();
                fd.append("approval_required", String(newVal));
                fd.append("regex_enabled", String(regexEnabled));
                fd.append("llm_enabled", String(llmEnabled));
                fd.append("sync_interval_minutes", String(syncInterval));
                startTransition(async () => { await updateEmailSyncSettingsAction(fd); });
              }}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.orange}`}><Check size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Approval Required</div>
                    <div className={styles.itemSubtitle}>Review transactions before saving</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <div className={`${styles.toggle} ${approvalRequired ? styles.toggleOn : ""}`}>
                    <div className={styles.toggleKnob} />
                  </div>
                </div>
              </div>

              {/* Regex Engine toggle */}
              <div className={styles.listItem} onClick={() => {
                const newVal = !regexEnabled;
                setRegexEnabled(newVal);
                const fd = new FormData();
                fd.append("approval_required", String(approvalRequired));
                fd.append("regex_enabled", String(newVal));
                fd.append("llm_enabled", String(llmEnabled));
                fd.append("sync_interval_minutes", String(syncInterval));
                startTransition(async () => { await updateEmailSyncSettingsAction(fd); });
              }}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.purple}`}><Zap size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Regex Parser</div>
                    <div className={styles.itemSubtitle}>Fast pattern matching (zero API cost)</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <div className={`${styles.toggle} ${regexEnabled ? styles.toggleOn : ""}`}>
                    <div className={styles.toggleKnob} />
                  </div>
                </div>
              </div>

              {/* AI Engine toggle */}
              <div className={styles.listItem} onClick={() => {
                const newVal = !llmEnabled;
                setLlmEnabled(newVal);
                const fd = new FormData();
                fd.append("approval_required", String(approvalRequired));
                fd.append("regex_enabled", String(regexEnabled));
                fd.append("llm_enabled", String(newVal));
                fd.append("sync_interval_minutes", String(syncInterval));
                startTransition(async () => { await updateEmailSyncSettingsAction(fd); });
              }}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.green}`}><Bot size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>AI Engine Enabled</div>
                    <div className={styles.itemSubtitle}>Enable LLM extraction for non-standard emails</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <div className={`${styles.toggle} ${llmEnabled ? styles.toggleOn : ""}`}>
                    <div className={styles.toggleKnob} />
                  </div>
                </div>
              </div>

              {/* AI Config Panel — isolated sub-component */}
              {llmEnabled && (
                <AIConfigPanel
                  aiProvider={aiProvider}
                  setAiProvider={setAiProvider}
                  gmailStatus={gmailStatus}
                  isPending={isPending}
                  startTransition={startTransition}
                />
              )}

              {/* Sync Interval */}
              <div className={styles.listItem}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.gray}`}><Clock size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Auto-Sync Interval</div>
                    <div className={styles.itemSubtitle}>How often to check for new emails</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <select
                    value={syncInterval}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setSyncInterval(val);
                      const fd = new FormData();
                      fd.append("approval_required", String(approvalRequired));
                      fd.append("regex_enabled", String(regexEnabled));
                      fd.append("llm_enabled", String(llmEnabled));
                      fd.append("sync_interval_minutes", String(val));
                      startTransition(async () => { await updateEmailSyncSettingsAction(fd); });
                    }}
                    style={{
                      padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--border)",
                      background: "var(--surface)", fontSize: "13px", color: "var(--text-primary)",
                      fontFamily: "inherit", cursor: "pointer"
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value={0}>Manual Only</option>
                    <option value={30}>Every 30 min</option>
                    <option value={60}>Every 1 hour</option>
                    <option value={180}>Every 3 hours</option>
                    <option value={360}>Every 6 hours</option>
                    <option value={720}>Every 12 hours</option>
                  </select>
                </div>
              </div>

            </div>
          </div>

          {/* SMS FORWARDING SECTION */}
          <div className={styles.settingsSection}>
            <div className={styles.sectionTitle}>SMS FORWARDING</div>
            <div className={styles.listBlock}>

              {/* Webhook URL */}
              <div className={styles.listItem}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.green}`}><Smartphone size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Webhook URL</div>
                    <div className={styles.itemSubtitle} style={{ wordBreak: "break-all", fontSize: "11px", fontFamily: "monospace" }}>
                      {webhookSecret
                        ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/sms?secret=${webhookSecret}`
                        : "Loading..."}
                    </div>
                  </div>
                </div>
                <div className={styles.itemRight} style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!webhookSecret) return;
                      const url = `${window.location.origin}/api/sms?secret=${webhookSecret}`;
                      navigator.clipboard.writeText(url);
                      setSmsCopied(true);
                      setTimeout(() => setSmsCopied(false), 2000);
                    }}
                    style={{
                      background: "transparent", border: "1px solid var(--border)", borderRadius: "6px",
                      padding: "6px 10px", cursor: "pointer", color: smsCopied ? "var(--success)" : "var(--text-secondary)",
                      display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 500,
                    }}
                    title="Copy URL"
                  >
                    {smsCopied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                  </button>
                </div>
              </div>

              {/* Regenerate Secret */}
              <div className={styles.listItem} onClick={() => {
                if (isPending) return;
                startTransition(async () => {
                  const res = await regenerateWebhookSecretAction();
                  if (res.error) {
                    setSmsRegenerateMsg(`Error: ${res.error}`);
                  } else {
                    setWebhookSecret(res.secret || null);
                    setSmsRegenerateMsg("Secret regenerated!");
                  }
                  setTimeout(() => setSmsRegenerateMsg(""), 3000);
                });
              }}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.orange}`}><RotateCcw size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Regenerate Secret</div>
                    <div className={styles.itemSubtitle}>
                      {smsRegenerateMsg || "Generate a new webhook URL (invalidates old one)"}
                    </div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <RotateCcw size={16} />
                </div>
              </div>

              {/* iPhone Shortcut Guide */}
              <div className={styles.listItem} onClick={() => setSmsGuideOpen(!smsGuideOpen)}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.purple}`}><Key size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>iPhone Shortcut Setup</div>
                    <div className={styles.itemSubtitle}>Step-by-step guide to auto-forward SMS</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  {smsGuideOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {smsGuideOpen && (
                <div className={styles.expandedPanel}>
                  <div style={{ fontSize: "13px", lineHeight: "1.8", color: "var(--text-secondary)" }}>
                    <p style={{ fontWeight: 600, marginBottom: "8px", color: "var(--text-primary)" }}>
                      Automate bank SMS forwarding from your iPhone:
                    </p>
                    <ol style={{ paddingLeft: "18px", margin: 0 }}>
                      <li>Open <strong>Shortcuts</strong> → <strong>Automation</strong> → <strong>New Automation</strong></li>
                      <li>Trigger: <strong>"When I receive a message"</strong> from your bank sender IDs
                        <br />
                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                          e.g. BW-HDFCBK, AD-ICICIT, AX-SBIINB, VM-KOTAKB
                        </span>
                      </li>
                      <li>Action: <strong>"Get Contents of URL"</strong>
                        <ul style={{ paddingLeft: "16px", marginTop: "4px" }}>
                          <li>URL: <em>Your webhook URL (copied above)</em></li>
                          <li>Method: <strong>POST</strong></li>
                          <li>Headers: <code style={{ fontSize: "11px", background: "var(--surface)", padding: "2px 6px", borderRadius: "4px" }}>Content-Type: application/json</code></li>
                          <li>Body: <code style={{ fontSize: "11px", background: "var(--surface)", padding: "2px 6px", borderRadius: "4px" }}>{`{ "sender": "[Sender]", "body": "[Message]" }`}</code></li>
                        </ul>
                      </li>
                      <li>Toggle <strong>"Run Immediately"</strong> (no confirmation prompt)</li>
                    </ol>
                    <p style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-tertiary)" }}>
                      💡 Tip: Create one automation per bank sender ID for best results.
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* DATA SECTION */}
          <div className={styles.settingsSection}>
            <div className={styles.sectionTitle}>DATA</div>
            <div className={styles.listBlock}>
              <div className={styles.listItem} onClick={handleExport}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.gray}`}><Download size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Export All Data</div>
                    <div className={styles.itemSubtitle}>
                      {exportMsg || "Download all your transactions as CSV"}
                    </div>
                  </div>
                </div>
                <div className={styles.itemRight}><Download size={16} /></div>
              </div>

              {/* RESET ACCOUNT */}
              <div className={styles.listItem} onClick={handleResetAccountClick}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap}`} style={{ color: "var(--danger)", background: "var(--danger-light)" }}><AlertTriangle size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle} style={{ color: "var(--danger)" }}>Reset Account</div>
                    <div className={styles.itemSubtitle} style={{ color: resetMsg.includes("Error") ? "var(--danger)" : "var(--text-tertiary)" }}>
                      {resetMsg || "Permanently delete all data"}
                    </div>
                  </div>
                </div>
                <div className={styles.itemRight} style={{ color: "var(--danger)" }}><AlertTriangle size={16} /></div>
              </div>
            </div>
          </div>

          {/* SIGN OUT */}
          <div className={styles.settingsSection}>
            <form action={signOut}>
              <button className={`${styles.listItem} ${styles.listBlock}`} style={{ width: "100%", padding: "18px 24px", color: "var(--danger)" }}>
                <div className={styles.itemLeft} style={{ width: "100%", justifyContent: "center", gap: "8px", fontWeight: "600" }}>
                  <LogOut size={18} />
                  Sign Out Securely
                </div>
              </button>
            </form>
          </div>
        </div>

      </div>

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onConfirm={handleResetAccountConfirm}
        onCancel={() => setIsResetConfirmOpen(false)}
        title="Reset Account"
        message="Are you sure you want to reset your account? This will permanently delete all your accounts, transactions, budgets, goals, and categories. This action cannot be undone."
        confirmText="Reset Account"
        variant="danger"
        isPending={isPending}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AIConfigPanel — Isolated sub-component
// Each provider has its own controlled state slots. Switching
// tabs never contaminates the other provider's fields.
// ═══════════════════════════════════════════════════════════

function AIConfigPanel({ 
  aiProvider, setAiProvider, gmailStatus, isPending, startTransition 
}: {
  aiProvider: "gemini" | "bytez";
  setAiProvider: (v: "gemini" | "bytez") => void;
  gmailStatus: any;
  isPending: boolean;
  startTransition: (fn: () => Promise<void>) => void;
}) {
  // Isolated controlled state — one set per provider
  const [geminiKeys, setGeminiKeys] = useState(gmailStatus?.settings?.gemini_api_keys?.join(", ") || "");
  const [geminiModel, setGeminiModel] = useState(gmailStatus?.settings?.gemini_model_id || "gemini-2.5-flash");
  const [bytezKey, setBytezKey] = useState(gmailStatus?.settings?.bytez_api_key || "");
  const [bytezModel, setBytezModel] = useState(gmailStatus?.settings?.bytez_model_id || "Qwen/Qwen2.5-7B-Instruct");

  const [showGeminiKeys, setShowGeminiKeys] = useState(false);
  const [showBytezKey, setShowBytezKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const handleSaveGemini = () => {
    const fd = new FormData();
    fd.append("update_ai_config", "true");
    fd.append("selected_llm_provider", "gemini");
    fd.append("gemini_api_keys", geminiKeys);
    fd.append("gemini_model_id", geminiModel);
    startTransition(async () => {
      await updateEmailSyncSettingsAction(fd);
      setSaveMsg("✓ Saved");
      setTimeout(() => setSaveMsg(""), 2500);
    });
  };

  const handleSaveBytez = () => {
    const fd = new FormData();
    fd.append("update_ai_config", "true");
    fd.append("selected_llm_provider", "bytez");
    fd.append("bytez_api_key", bytezKey);
    fd.append("bytez_model_id", bytezModel);
    startTransition(async () => {
      await updateEmailSyncSettingsAction(fd);
      setSaveMsg("✓ Saved");
      setTimeout(() => setSaveMsg(""), 2500);
    });
  };

  return (
    <div className={styles.aiConfigPanel} onClick={(e) => e.stopPropagation()}>

      {/* Provider tabs */}
      <div className={styles.aiProviderTabs}>
        <button
          className={`${styles.aiProviderTab} ${aiProvider === "gemini" ? styles.aiProviderTabActive : ""}`}
          onClick={() => { setAiProvider("gemini"); setShowBytezKey(false); }}
        >
          <Sparkles size={14} /> Google Gemini
        </button>
        <button
          className={`${styles.aiProviderTab} ${aiProvider === "bytez" ? styles.aiProviderTabActive : ""}`}
          onClick={() => { setAiProvider("bytez"); setShowGeminiKeys(false); }}
        >
          <Bot size={14} /> Bytez API
        </button>
      </div>

      {/* ── Gemini Config ─────────────────────────────── */}
      {aiProvider === "gemini" && (
        <div className={styles.aiConfigBody}>
          <div className={styles.aiConfigField}>
            <label className={styles.aiConfigLabel}>API Keys</label>
            <div className={styles.aiKeyInputWrap}>
              <input
                type={showGeminiKeys ? "text" : "password"}
                className={styles.aiConfigInput}
                placeholder="AIzaSy..., AIzaSy..."
                value={geminiKeys}
                onChange={(e) => setGeminiKeys(e.target.value)}
                autoComplete="off"
              />
              <button
                className={styles.aiKeyToggle}
                onClick={() => setShowGeminiKeys(!showGeminiKeys)}
                type="button"
                title={showGeminiKeys ? "Hide keys" : "Show keys"}
              >
                {showGeminiKeys ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className={styles.aiConfigHint}>
              Comma-separated. Multiple keys rotate automatically to maximize daily quota.
            </p>
          </div>

          <div className={styles.aiConfigField}>
            <label className={styles.aiConfigLabel}>Model</label>
            <select
              className={styles.aiConfigSelect}
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash — 20 RPD free tier</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash — Higher throughput</option>
            </select>
          </div>

          <div className={styles.aiConfigActions}>
            {saveMsg && <span className={styles.aiSaveMsg}>{saveMsg}</span>}
            <button className={styles.aiSaveBtn} onClick={handleSaveGemini} disabled={isPending}>
              <Save size={14} /> {isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* ── Bytez Config ──────────────────────────────── */}
      {aiProvider === "bytez" && (
        <div className={styles.aiConfigBody}>
          <div className={styles.aiConfigField}>
            <label className={styles.aiConfigLabel}>API Key</label>
            <div className={styles.aiKeyInputWrap}>
              <input
                type={showBytezKey ? "text" : "password"}
                className={styles.aiConfigInput}
                placeholder="Enter your Bytez API key"
                value={bytezKey}
                onChange={(e) => setBytezKey(e.target.value)}
                autoComplete="off"
              />
              <button
                className={styles.aiKeyToggle}
                onClick={() => setShowBytezKey(!showBytezKey)}
                type="button"
                title={showBytezKey ? "Hide key" : "Show key"}
              >
                {showBytezKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className={styles.aiConfigField}>
            <label className={styles.aiConfigLabel}>Model</label>
            <input
              type="text"
              className={styles.aiConfigInput}
              placeholder="e.g. Qwen/Qwen2.5-7B-Instruct"
              value={bytezModel}
              onChange={(e) => setBytezModel(e.target.value)}
            />
            <p className={styles.aiConfigHint}>
              Any Hugging Face model ID supported by Bytez.
            </p>
          </div>

          <div className={styles.aiConfigActions}>
            {saveMsg && <span className={styles.aiSaveMsg}>{saveMsg}</span>}
            <button className={styles.aiSaveBtn} onClick={handleSaveBytez} disabled={isPending}>
              <Save size={14} /> {isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MerchantRulesPanel — Isolated sub-component
// ═══════════════════════════════════════════════════════════

function MerchantRulesPanel({ 
  isPending, startTransition 
}: {
  isPending: boolean;
  startTransition: (fn: () => Promise<void>) => void;
}) {
  const [rules, setRules] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isOpen && !loaded) {
      getMerchantRulesAction().then((res) => {
        setRules(res.rules || []);
        setLoaded(true);
      });
    }
  }, [isOpen, loaded]);

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteMerchantRuleAction(id);
      setRules(rules.filter(r => r.id !== id));
    });
  };

  return (
    <>
      <div className={styles.listItem} onClick={() => setIsOpen(!isOpen)}>
        <div className={styles.itemLeft}>
          <div className={`${styles.iconWrap} ${styles.blue}`}><Sparkles size={18} /></div>
          <div className={styles.itemText}>
            <div className={styles.itemTitle}>Merchant Auto-Categorization</div>
            <div className={styles.itemSubtitle}>View and manage learned renaming rules</div>
          </div>
        </div>
        <div className={styles.itemRight}>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{isOpen ? "Collapse" : "Expand"}</span>
        </div>
      </div>
      
      {isOpen && (
        <div className={styles.expandedPanel}>
          {!loaded ? (
            <div style={{ padding: "12px", color: "var(--text-tertiary)", fontSize: "13px" }}>Loading...</div>
          ) : rules.length === 0 ? (
            <div style={{ padding: "12px", color: "var(--text-tertiary)", fontSize: "13px", textAlign: "center" }}>
              No rules found. When you edit a synced transaction, check the "Apply to future" box to create one!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {rules.map((rule) => (
                <div key={rule.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px"
                }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 600 }}>Original</span>
                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{rule.synced_name}</span>
                  </div>
                  <span style={{ color: "var(--text-tertiary)" }}>→</span>
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingLeft: "12px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 600 }}>Renames to</span>
                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                      {rule.renamed_to} {rule.categories?.name ? `(${rule.categories.name})` : ""}
                    </span>
                  </div>
                  <button 
                    disabled={isPending}
                    onClick={() => handleDelete(rule.id)}
                    style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: "4px" }}
                    title="Delete rule"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
