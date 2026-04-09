"use client";

import styles from "./ui.module.css";

type SegmentType = "income" | "expense" | "transfer";

interface SegmentedControlProps {
  value: SegmentType;
  onChange: (value: SegmentType) => void;
}

export function SegmentedControl({ value, onChange }: SegmentedControlProps) {
  return (
    <div className={styles.segmentedControl}>
      <button
        type="button"
        className={`${styles.segmentBtn} ${value === "expense" ? `${styles.active} ${styles.expense}` : ""}`}
        onClick={() => onChange("expense")}
      >
        Expense
      </button>
      <button
        type="button"
        className={`${styles.segmentBtn} ${value === "income" ? `${styles.active} ${styles.income}` : ""}`}
        onClick={() => onChange("income")}
      >
        Income
      </button>
      <button
        type="button"
        className={`${styles.segmentBtn} ${value === "transfer" ? `${styles.active} ${styles.transfer}` : ""}`}
        onClick={() => onChange("transfer")}
      >
        Transfer
      </button>
    </div>
  );
}
