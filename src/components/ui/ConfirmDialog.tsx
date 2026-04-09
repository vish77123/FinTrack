"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import styles from "./ui.module.css";

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning";
  isPending?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title = "Are you sure?",
  message = "This action cannot be undone.",
  confirmText = "Delete",
  cancelText = "Cancel",
  variant = "danger",
  isPending = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isDanger = variant === "danger";

  return (
    <div className={styles.confirmOverlay} onClick={onCancel}>
      <div
        ref={dialogRef}
        className={styles.confirmDialog}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div
          className={styles.confirmIconWrap}
          style={{
            background: isDanger ? "var(--danger-light)" : "var(--warning-light)",
            color: isDanger ? "var(--danger)" : "var(--warning)",
          }}
        >
          {isDanger ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
        </div>

        {/* Content */}
        <h3 className={styles.confirmTitle}>{title}</h3>
        <p className={styles.confirmMessage}>{message}</p>

        {/* Actions */}
        <div className={styles.confirmActions}>
          <button
            className={styles.confirmCancelBtn}
            onClick={onCancel}
            disabled={isPending}
          >
            {cancelText}
          </button>
          <button
            className={styles.confirmDeleteBtn}
            style={{
              background: isDanger ? "var(--danger)" : "var(--warning)",
            }}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Deleting..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
