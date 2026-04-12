"use client";

import { useState } from "react";
import { MessageSquare, Copy, Check, Hash, Smartphone, AlertCircle } from "lucide-react";
import styles from "./settings.module.css"; 

export default function SmsClient({ webhookSecret, smsLogs }: { webhookSecret: string, smsLogs: any[] }) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  
  const webhookUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/api/sms` 
    : "https://your-domain.com/api/sms";

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const copySecret = () => {
    navigator.clipboard.writeText(webhookSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1>SMS Parser</h1>
        <p>Sync iOS Shortcuts with incoming SMS payloads</p>
      </div>

      <div className={styles.settingsGrid}>
        {/* Left Column: Instructions & Setup */}
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <div className={styles.settingsSection}>
            <div className={styles.sectionTitle}>WEBHOOK CONFIGURATION</div>
            <div className={styles.listBlock}>
              
              {/* Webhook URL */}
              <div className={styles.listItem} onClick={copyUrl}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.blue}`}><Hash size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Webhook URL</div>
                    <div className={styles.itemSubtitle}>{webhookUrl}</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  {copiedUrl ? <Check size={16} /> : <Copy size={16} />}
                </div>
              </div>

              {/* Webhook Secret */}
              <div className={styles.listItem} onClick={copySecret}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.orange}`}><AlertCircle size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>Secret Token</div>
                    <div className={styles.itemSubtitle}>•••••••••••••••••••••••••••••</div>
                  </div>
                </div>
                <div className={styles.itemRight}>
                  {copiedSecret ? <Check size={16} /> : <Copy size={16} />}
                </div>
              </div>

              {/* Guide */}
              <div className={styles.listItem} style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start", gap: "12px" }}>
                <div className={styles.itemLeft}>
                  <div className={`${styles.iconWrap} ${styles.gray}`}><Smartphone size={18} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>iOS Shortcut Setup</div>
                    <div className={styles.itemSubtitle}>How to forward SMS from your iPhone</div>
                  </div>
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", background: "var(--bg)", padding: "12px", borderRadius: "8px", width: "100%", lineHeight: 1.5 }}>
                  <ol style={{ margin: 0, paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <li>Open Shortcuts app, create a new Automation for <strong>When I get a message</strong>.</li>
                    <li>Add action <strong>Get contents of URL</strong>.</li>
                    <li>Paste the Webhook URL. Set Method to <strong>POST</strong>.</li>
                    <li>Add JSON body fields:
                      <ul style={{ paddingLeft: "16px", marginTop: "4px" }}>
                        <li><code>secret</code>: (Paste your Secret Token)</li>
                        <li><code>sender</code>: <em>Shortcut Input ➜ Sender</em></li>
                        <li><code>body</code>: <em>Shortcut Input ➜ Content</em></li>
                      </ul>
                    </li>
                  </ol>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Right Column: Recent SMS */}
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <div className={styles.settingsSection}>
            <div className={styles.sectionTitle}>RECENT SMS LOGS</div>
            
            {smsLogs.length === 0 ? (
              <div className={styles.listBlock} style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "14px" }}>
                <MessageSquare size={32} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
                No SMS logs received yet. Trigger the shortcut to see logs here.
              </div>
            ) : (
              <div className={styles.listBlock}>
                {smsLogs.map((sms: any) => (
                  <div key={sms.id} className={styles.listItem} style={{ alignItems: "flex-start", cursor: "default" }}>
                    <div className={styles.itemLeft} style={{ alignItems: "flex-start" }}>
                      <div className={`${styles.iconWrap} ${styles.green}`} style={{ width: "32px", height: "32px" }}>
                        <MessageSquare size={14} />
                      </div>
                      <div className={styles.itemText} style={{ gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className={styles.itemTitle} style={{ fontSize: "14px" }}>{sms.sender}</span>
                          <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                            {new Date(sms.received_at).toLocaleString()}
                          </span>
                        </div>
                        <div className={styles.itemSubtitle} style={{ lineHeight: 1.4, color: "var(--text-primary)" }}>
                          {sms.body}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
