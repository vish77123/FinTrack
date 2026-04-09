"use client";

import { useRef, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { BaseModal } from "./BaseModal";
import { addGoalAction } from "@/app/actions/goals";
import { CurrencyInput } from "./CurrencyInput";
import styles from "./ui.module.css";
import { Target, Calendar, Check, AlertCircle } from "lucide-react";

interface AddGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const presetIcons = ["🎯", "🏖️", "💻", "🚗", "🏠", "💍", "🎓", "📱"];
const presetColors = ["#6C63FF", "#34C759", "#FF3B30", "#FF9500", "#5856D6", "#AF52DE", "#FF2D55", "#007AFF"];

export function AddGoalModal({ isOpen, onClose }: AddGoalModalProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  
  const [amount, setAmount] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("🎯");
  const [selectedColor, setSelectedColor] = useState("#6C63FF");

  if (!isOpen) return null;

  const handleSubmit = (formData: FormData) => {
    setErrorDetails(null);
    formData.append("target_amount", amount);
    formData.append("icon", selectedIcon);
    formData.append("color", selectedColor);

    startTransition(async () => {
      const res = await addGoalAction(formData);
      if (res?.error) {
        setErrorDetails(res.error);
      } else {
        // Success
        setAmount("");
        setSelectedIcon("🎯");
        setSelectedColor("#6C63FF");
        formRef.current?.reset();
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="New Savings Goal">
      <form ref={formRef} action={handleSubmit} className={styles.formContainer}>
        
        {errorDetails && (
          <div className={styles.errorBox}>
            <AlertCircle size={16} />
            {errorDetails}
          </div>
        )}

        {/* Goal Name */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Goal Name</label>
          <div className={styles.inputWrap}>
            <Target size={18} className={styles.inputIcon} />
            <input 
              name="name" 
              className={styles.input} 
              placeholder="e.g. MacBook Pro, Japan Trip..." 
              required
              disabled={isPending}
            />
          </div>
        </div>

        {/* Target Amount */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Target Amount</label>
          <CurrencyInput
            value={amount}
            onChange={(val) => setAmount(val)}
            placeholder="0.00"
          />
        </div>

        {/* Target Date */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Target Date (Optional)</label>
          <div className={styles.inputWrap}>
            <Calendar size={18} className={styles.inputIcon} />
            <input 
              name="target_date" 
              type="date"
              className={styles.input} 
              disabled={isPending}
            />
          </div>
        </div>

        {/* Aesthetics Picker */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Icon & Color</label>
          <div style={{ display: 'flex', gap: '16px', background: 'var(--surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', flexWrap: "wrap" }}>
            
            <div style={{ flex: 1, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {presetIcons.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: "1px solid", 
                    borderColor: selectedIcon === icon ? selectedColor : "var(--border)",
                    background: selectedIcon === icon ? `${selectedColor}15` : "var(--bg)",
                    fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {presetColors.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  style={{
                    width: 32, height: 32, borderRadius: "50%", border: "none",
                    background: color, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                  }}
                >
                  {selectedColor === color && <Check size={16} color="white" />}
                </button>
              ))}
            </div>

          </div>
        </div>

        {/* Actions */}
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose} className={styles.btnSecondary} disabled={isPending}>
            Cancel
          </button>
          <button type="submit" className={styles.btnPrimary} style={{ background: selectedColor }} disabled={isPending}>
            {isPending ? "Creating..." : "Save Goal"}
          </button>
        </div>

      </form>
    </BaseModal>
  );
}
