"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { 
  User, DollarSign, Moon, Sun, Monitor, Tag, Download, LogOut,
  Check, X, Pencil, Save, Mail, Zap, Bot, RefreshCw, Clock, Key, Sparkles, Eye, EyeOff, AlertTriangle
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
  const [mounted, setMounted] = useState(false);

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

  // Load profile on mount
  useEffect(() => {
    setMounted(true);
    getUserProfileAction().then((res) => {
      if (res.success) {
        setDisplayName(res.displayName || "");
        setEmail(res.email || "");
        setSelectedCurrency(res.currencyCode || "INR");
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
                    {!mounted ? <div style={{ width: 18, height: 18 }} /> : themeMode === "dark" ? <Moon size={18} /> : themeMode === "light" ? <Sun size={18} /> : <Monitor size={18} />}
                  </div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Appearance</div>
                    <div className={styles.itemSubtitle}>{!mounted ? "Loading..." : `${themeLabel} mode`}</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{!mounted ? "" : themeLabel}</span>
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
