"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Smile } from "lucide-react";
import { addCategoryAction } from "@/app/actions/categories";
import styles from "./ui.module.css";

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  type?: string;
}

interface CategoryPickerProps {
  categories: Category[];
  value: string; // The ID of the selected category
  onChange: (id: string) => void;
  label?: string;
  error?: string;
  transactionType?: string; // To know whether to create an income/expense category
}

const presetColors = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#8E8E93"];

export function CategoryPicker({ categories, value, onChange, label, error, transactionType = "expense" }: CategoryPickerProps) {
  const router = useRouter();
  
  // Track newly created categories locally to prevent UI pop-in delays caused by Next.js cache.
  const [optimisticCategories, setOptimisticCategories] = useState<Category[]>([]);
  
  // Only show categories that match the current transaction type
  // Check combinations to prevent duplicate keys if router.refresh() responds instantly
  const allCategories = [...categories];
  for (const optCategory of optimisticCategories) {
    if (!allCategories.some(c => c.id === optCategory.id)) {
      allCategories.push(optCategory);
    }
  }
  
  const filteredCategories = allCategories.filter(c => !c.type || c.type === transactionType || c.id.includes("default"));

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("🏷️");
  const [newColor, setNewColor] = useState(presetColors[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  const handleCreateCategory = async () => {
    setCreateError("");
    if (!newName.trim()) {
      setCreateError("Name is required");
      return;
    }

    // Default icon fallback if the user left it empty
    const finalIcon = newIcon.trim() || "🏷️";

    setIsSubmitting(true);
    
    const formData = new FormData();
    formData.append("name", newName.trim());
    formData.append("type", transactionType);
    formData.append("icon", finalIcon);
    formData.append("color", newColor);

    const res = await addCategoryAction(formData);
    
    if (res.error) {
      setCreateError(res.error);
      setIsSubmitting(false);
    } else if (res.categoryId) {
      // Optimistically push the new category into the UI State instantly
      const newCategory: Category = {
        id: res.categoryId,
        name: newName.trim(),
        icon: finalIcon,
        color: newColor,
        type: transactionType
      };
      
      setOptimisticCategories(prev => [...prev, newCategory]);
      
      setNewName("");
      setNewIcon("🏷️");
      setIsCreating(false);
      setIsSubmitting(false);
      
      // Select the newly created category immediately
      onChange(res.categoryId);
      // Force Next.js to proactively refresh dashboard database state in the background
      router.refresh();
    }
  };

  return (
    <div className={styles.categoryPickerWrapper}>
      {label && <label className={styles.inputLabel}>{label}</label>}
      
      {isCreating ? (
        <div className={styles.inlineCreator}>
          <div className={styles.creatorHeader}>
            <span style={{ fontSize: "14px", fontWeight: 600 }}>Create New Category</span>
            <button type="button" onClick={() => setIsCreating(false)} className={styles.iconBtn}><X size={16}/></button>
          </div>
          
          {createError && <div style={{ color: "var(--danger)", fontSize: "12px", marginBottom: "12px" }}>{createError}</div>}
          
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ width: "60px", flexShrink: 0, position: "relative" }}>
              <input 
                type="text" 
                className={styles.formInput} 
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value.substring(0, 5))}
                style={{ textAlign: "center", fontSize: "18px", paddingLeft: "8px", paddingRight: "8px" }}
                title="Enter an Emoji"
              />
              {!newIcon && <Smile size={16} color="var(--text-tertiary)" style={{ position: "absolute", top: "14px", left: "22px", pointerEvents: "none" }}/>}
            </div>
            <input 
              type="text" 
              placeholder="Category Name" 
              className={styles.formInput} 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ flex: 1 }}
              autoFocus
            />
          </div>

          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", marginTop: "4px" }}>Select Color:</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {presetColors.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setNewColor(color)}
                style={{
                  width: 24, height: 24, borderRadius: "50%", border: "none",
                  background: color, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                {newColor === color && <Check size={12} color="white" />}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button 
              type="button" 
              className={styles.btnSecondary} 
              style={{ padding: "6px 12px", fontSize: "13px" }}
              onClick={() => setIsCreating(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              type="button" 
              className={styles.btnPrimary} 
              style={{ padding: "6px 12px", fontSize: "13px", background: newColor }}
              onClick={handleCreateCategory}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.categoryGrid}>
          {filteredCategories.map((cat) => {
            const isSelected = value === cat.id;
            
            return (
              <div
                key={cat.id}
                className={`${styles.categoryChip} ${isSelected ? styles.selected : ""}`}
                onClick={() => onChange(cat.id)}
              >
                <div 
                  className={styles.categoryIcon}
                  style={isSelected && cat.color ? { color: cat.color } : {}}
                >
                  {cat.icon || "🔖"}
                </div>
                <div className={styles.categoryName}>
                  {cat.name}
                </div>
              </div>
            );
          })}
          
          {/* Add New Category Button */}
          <div
            className={`${styles.categoryChip} ${styles.addNewChip}`}
            onClick={() => setIsCreating(true)}
          >
            <div className={styles.categoryIcon} style={{ background: "transparent", color: "var(--text-secondary)" }}>
              <Plus size={20} />
            </div>
            <div className={styles.categoryName} style={{ color: "var(--text-secondary)" }}>
              Add New
            </div>
          </div>
        </div>
      )}
      
      {error && !isCreating && <span style={{ color: "var(--danger)", fontSize: "12px", marginTop: "8px", display: "block" }}>{error}</span>}
    </div>
  );
}
