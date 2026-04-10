"use client";

import { useState, useEffect, useTransition } from "react";
import { signOut } from "@/app/login/actions";
import { 
  User, DollarSign, Moon, Sun, Monitor, Tag, Download, LogOut,
  Check, X, Pencil, Save
} from "lucide-react";
import styles from "@/components/dashboard/settings.module.css";
import { useUIStore } from "@/store/useUIStore";
import { 
  updateProfileAction, 
  exportAllTransactionsAction, 
  getUserProfileAction, 
  updateCurrencyAction 
} from "@/app/actions/settings";

const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee (₹)" },
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
  { code: "EUR", symbol: "€", label: "Euro (€)" },
  { code: "GBP", symbol: "£", label: "British Pound (£)" },
];

type ThemeMode = "light" | "dark" | "system";

export function SettingsClient() {
  const { theme, setTheme, setCategoryManagerModalOpen } = useUIStore();
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

  // Export state
  const [exportMsg, setExportMsg] = useState("");

  // Load profile on mount
  useEffect(() => {
    getUserProfileAction().then((res) => {
      if (res.success) {
        setDisplayName(res.displayName || "");
        setEmail(res.email || "");
        setSelectedCurrency(res.currencyCode || "INR");
        setProfileLoaded(true);
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

              {/* PROFILE — Functional */}
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

              {/* Profile edit — Expandable inline */}
              {isEditingProfile && (
                <div className={styles.expandedPanel}>
                  {profileMsg && (
                    <div style={{ 
                      padding: "10px 14px", 
                      borderRadius: "8px", 
                      fontSize: "13px", 
                      marginBottom: "12px",
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
                    <input
                      type="text"
                      className="form-input"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setIsEditingProfile(false)}
                      disabled={isPending}
                      style={{ fontSize: "13px", padding: "8px 16px" }}
                    >
                      <X size={14} /> Cancel
                    </button>
                    <button 
                      className="btn btn-primary" 
                      onClick={handleProfileSave}
                      disabled={isPending}
                      style={{ fontSize: "13px", padding: "8px 16px" }}
                    >
                      <Save size={14} /> {isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {/* CURRENCY — Functional */}
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

              {/* Currency picker — Expandable */}
              {showCurrencyPicker && (
                <div className={styles.expandedPanel}>
                  {CURRENCIES.map(cur => (
                    <button
                      key={cur.code}
                      className={`${styles.optionBtn} ${selectedCurrency === cur.code ? styles.optionActive : ""}`}
                      onClick={() => handleCurrencyChange(cur.code)}
                    >
                      <span style={{ fontSize: "18px" }}>{cur.symbol}</span>
                      <span>{cur.label}</span>
                      {selectedCurrency === cur.code && <Check size={16} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
                    </button>
                  ))}
                </div>
              )}

              {/* APPEARANCE — Functional */}
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

              {/* Theme picker — Expandable */}
              {showThemePicker && (
                <div className={styles.expandedPanel}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {([
                      { mode: "light" as ThemeMode, icon: <Sun size={16} />, label: "Light" },
                      { mode: "dark" as ThemeMode, icon: <Moon size={16} />, label: "Dark" },
                      { mode: "system" as ThemeMode, icon: <Monitor size={16} />, label: "System" },
                    ]).map(opt => (
                      <button
                        key={opt.mode}
                        className={`${styles.themeBtn} ${themeMode === opt.mode ? styles.themeBtnActive : ""}`}
                        onClick={() => handleThemeChange(opt.mode)}
                      >
                        {opt.icon}
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* CATEGORIES — Link */}
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
          <div className={styles.settingsSection}>
            <div className={styles.sectionTitle}>DATA</div>
            <div className={styles.listBlock}>

              {/* EXPORT DATA — Functional */}
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
                <div className={styles.itemRight}>
                  <Download size={16} />
                </div>
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
    </div>
  );
}
