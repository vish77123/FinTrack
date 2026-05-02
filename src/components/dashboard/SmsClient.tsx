"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Smartphone, CheckCircle, Clock, XCircle, Trash2, RefreshCw, RotateCcw } from "lucide-react";
import { getSmsLogsAction, deleteSmsAction, retrySmsParseAction } from "@/app/actions/sms";
import styles from "./sms.module.css";

interface SmsLog {
  id: string;
  sender: string;
  body: string;
  received_at: string;
  created_at: string;
  parseStatus: "parsed" | "pending" | "failed";
  parsedAmount: number | null;
  parsedMerchant: string | null;
  parsedBy: string | null;
  pendingId: string | null;
}

export function SmsClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = () => {
    getSmsLogsAction().then((res) => {
      setLogs(res.logs || []);
      setLoaded(true);
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteSmsAction(id);
      setLogs(logs.filter(l => l.id !== id));
    });
  };

  const handleRetry = async (id: string) => {
    setRetryingIds(prev => new Set(prev).add(id));
    try {
      const result = await retrySmsParseAction(id);
      if (result.error) {
        alert(`Retry failed: ${result.error}`);
      } else {
        // Refresh logs to reflect the new pending state
        loadLogs();
      }
    } catch (err: any) {
      alert(`Retry error: ${err.message || "Unknown error"}`);
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRefresh = () => {
    setLoaded(false);
    loadLogs();
  };

  const getStatusBadge = (status: "parsed" | "pending" | "failed") => {
    switch (status) {
      case "parsed":
        return (
          <span className={`${styles.badge} ${styles.badgeSuccess}`}>
            <CheckCircle size={12} /> Parsed ✓
          </span>
        );
      case "pending":
        return (
          <span className={`${styles.badge} ${styles.badgePending}`}>
            <Clock size={12} /> Pending review
          </span>
        );
      case "failed":
        return (
          <span className={`${styles.badge} ${styles.badgeFailed}`}>
            <XCircle size={12} /> Failed to parse
          </span>
        );
    }
  };

  const getParserLabel = (parsedBy: string | null) => {
    switch (parsedBy) {
      case "sms-regex": return "Regex";
      case "sms-gemini": return "Gemini AI";
      case "sms-nvidia": return "NVIDIA NIM";
      default: return parsedBy || "—";
    }
  };

  // Stats
  const totalCount = logs.length;
  const parsedCount = logs.filter(l => l.parseStatus === "parsed").length;
  const pendingCount = logs.filter(l => l.parseStatus === "pending").length;
  const failedCount = logs.filter(l => l.parseStatus === "failed").length;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerTop}>
          <div>
            <h1>SMS Parser</h1>
            <p>Incoming bank SMS messages and their parse status</p>
          </div>
          <button
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={!loaded}
          >
            <RefreshCw size={16} className={!loaded ? styles.spinning : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: "rgba(99, 102, 241, 0.1)", color: "#6366f1" }}>
            <MessageSquare size={20} />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{totalCount}</div>
            <div className={styles.statLabel}>Total SMS</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e" }}>
            <CheckCircle size={20} />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{parsedCount}</div>
            <div className={styles.statLabel}>Parsed</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: "rgba(251, 191, 36, 0.1)", color: "#fbbf24" }}>
            <Clock size={20} />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{pendingCount}</div>
            <div className={styles.statLabel}>Pending</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444" }}>
            <XCircle size={20} />
          </div>
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{failedCount}</div>
            <div className={styles.statLabel}>Failed</div>
          </div>
        </div>
      </div>

      {/* SMS List */}
      <div className={styles.listSection}>
        {!loaded ? (
          <div className={styles.emptyState}>
            <RefreshCw size={24} className={styles.spinning} />
            <p>Loading SMS logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className={styles.emptyState}>
            <Smartphone size={48} />
            <h3>No SMS received yet</h3>
            <p>Set up the iPhone Shortcut in Settings to start auto-forwarding bank SMS.</p>
          </div>
        ) : (
          <div className={styles.smsList}>
            {logs.map(log => (
              <div key={log.id} className={styles.smsCard}>
                <div className={styles.smsMain}>
                  <div className={styles.smsSender}>
                    <Smartphone size={14} />
                    <span>{log.sender}</span>
                    <span className={styles.smsDate}>
                      {new Date(log.received_at).toLocaleDateString("en-IN", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </span>
                  </div>
                  <div className={styles.smsBody}>
                    {log.body.length > 160 ? log.body.slice(0, 160) + "..." : log.body}
                  </div>
                  <div className={styles.smsMeta}>
                    {getStatusBadge(log.parseStatus)}
                    {log.parseStatus === "failed" && (
                      <button
                        className={styles.retryBtn}
                        onClick={() => handleRetry(log.id)}
                        disabled={retryingIds.has(log.id)}
                        title="Retry parsing this SMS"
                      >
                        <RotateCcw size={12} className={retryingIds.has(log.id) ? styles.spinning : ""} />
                        {retryingIds.has(log.id) ? "Retrying…" : "Retry"}
                      </button>
                    )}
                    {log.parsedBy && (
                      <span className={styles.parserTag}>
                        via {getParserLabel(log.parsedBy)}
                      </span>
                    )}
                    {log.parsedAmount && (
                      <span className={styles.parsedAmount}>
                        ₹{log.parsedAmount.toLocaleString("en-IN")}
                      </span>
                    )}
                    {log.parsedMerchant && (
                      <span className={styles.parsedMerchant}>
                        → {log.parsedMerchant}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.smsActions}>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(log.id)}
                    disabled={isPending}
                    title="Delete SMS"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
