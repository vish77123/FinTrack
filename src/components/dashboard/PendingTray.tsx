"use client";

import { useState } from "react";
import { AlertCircle, Check, X, Smartphone, Mail } from "lucide-react";
import styles from "./dashboard.module.css";
import { mockData } from "@/lib/mockData";

export default function PendingTray() {
  const [pendingItems, setPendingItems] = useState(mockData.pendingTransactions);

  if (pendingItems.length === 0) return null;

  const handleConfirm = (id: string) => {
    setPendingItems((items) => items.filter((i) => i.id !== id));
  };

  const handleDiscard = (id: string) => {
    setPendingItems((items) => items.filter((i) => i.id !== id));
  };

  return (
    <div className={styles.pendingTray}>
      <div className={styles.pendingTrayHeader}>
        <AlertCircle size={16} />
        <span>{pendingItems.length} transactions auto-detected. Review and add them to your ledger.</span>
      </div>
      
      <div>
        {pendingItems.map((item) => (
          <div key={item.id} className={styles.pendingItem}>
            <div className={styles.txnIcon}>
              {item.category === "Transport" ? "🚗" : item.category === "Food" ? "🍔" : "🛒"}
            </div>
            
            <div className={styles.txnDetails}>
              <div className={styles.txnMerchant}>{item.merchant}</div>
              <div className={styles.txnMeta}>
                <span>{mockData.currency}{item.amount}</span> • 
                <span>{item.account}</span> • 
                <span className={styles.pendingSource}>
                  {item.detectedVia === "SMS" ? <Smartphone size={8} className="mr-1 inline" /> : <Mail size={8} className="mr-1 inline" />}
                  {item.detectedVia}
                </span>
                <span>• {item.date}</span>
              </div>
            </div>
            
            <div className={styles.pendingActions}>
              <button 
                className={`${styles.actionBtn} ${styles.discard}`}
                onClick={() => handleDiscard(item.id)}
              >
                Discard
              </button>
              <button 
                className={`${styles.actionBtn} ${styles.confirm}`}
                onClick={() => handleConfirm(item.id)}
              >
                Confirm
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
