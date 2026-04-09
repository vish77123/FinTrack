"use client";

import React, { useRef, useEffect } from "react";
import styles from "./ui.module.css";

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  currency?: string;
  placeholder?: string;
}

export function CurrencyInput({ value, onChange, currency = "₹", placeholder = "0" }: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-resize input width to match content length
  useEffect(() => {
    if (inputRef.current) {
      const length = value.length || 1;
      inputRef.current.style.width = `${length + 0.5}ch`;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip everything except numbers and a single decimal point
    const rawVal = e.target.value.replace(/[^0-9.]/g, "");
    
    // Prevent multiple decimals
    if ((rawVal.match(/\./g) || []).length > 1) return;

    onChange(rawVal);
  };

  // Format the visual value correctly with commas (Indian number system)
  const formatValue = (val: string) => {
    if (!val) return "";
    
    // Handle decimals independently
    const parts = val.split(".");
    let integerPart = parts[0];
    const decimalPart = parts.length > 1 ? `.${parts[1].substring(0, 2)}` : ""; // max 2 decimals

    // Format Indian commas (1,00,000)
    if (integerPart.length > 3) {
      const lastThree = integerPart.substring(integerPart.length - 3);
      const otherNumbers = integerPart.substring(0, integerPart.length - 3);
      integerPart = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
    }

    return integerPart + decimalPart;
  };

  return (
    <div className={styles.currencyInputWrapper}>
      <span className={styles.currencySymbol}>{currency}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className={styles.currencyInput}
        placeholder={placeholder}
        value={formatValue(value)}
        onChange={handleChange}
      />
    </div>
  );
}
