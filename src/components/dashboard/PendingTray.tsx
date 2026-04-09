"use client";

import { useState, useEffect } from "react";
import { AlertCircle, Smartphone, Mail } from "lucide-react";
import styles from "./dashboard.module.css";

interface PendingTrayProps {
  items: any[];
  currency: string;
}

export default function PendingTray({ items, currency }: PendingTrayProps) {
  const [pendingItems, setPendingItems] = useState(items);

  useEffect(() => {
    setPendingItems(items);
  }, [items]);

  if (pendingItems.length === 0) return null;

  const handleConfirm = (id: string) => {
    setPendingItems((currentItems) => currentItems.filter((i) => i.id !== id));
  };

  const handleDiscard = (id: string) => {
    setPendingItems((currentItems) => currentItems.filter((i) => i.id !== id));
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
                <span>{currency}{item.amount}</span> • 
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
