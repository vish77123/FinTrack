import { useState, useTransition } from "react";
import { Plus, Check, X, Smile, Trash2 } from "lucide-react";
import { BaseModal } from "./BaseModal";
import { SegmentedControl } from "./SegmentedControl";
import { addCategoryAction, deleteCategoryAction } from "@/app/actions/categories";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./ui.module.css";

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  type?: string;
}

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
}

const presetColors = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#8E8E93"];

export function CategoryManagerModal({ isOpen, onClose, categories }: CategoryManagerModalProps) {
  const [activeTab, setActiveTab] = useState("expense");
  const [isPending, startTransition] = useTransition();

  // Create state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [newColor, setNewColor] = useState(presetColors[0]);
  const [createError, setCreateError] = useState("");

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const filteredCategories = categories.filter(c => c.type === activeTab);

  const resetCreateForm = () => {
    setIsCreating(false);
    setNewName("");
    setNewIcon("");
    setNewColor(presetColors[0]);
    setCreateError("");
  };

  const handleCreateCategory = async () => {
    setCreateError("");
    if (!newName.trim()) {
      setCreateError("Name is required");
      return;
    }

    const finalIcon = newIcon.trim() || "🏷️";

    const formData = new FormData();
    formData.append("name", newName.trim());
    formData.append("type", activeTab);
    formData.append("icon", finalIcon);
    formData.append("color", newColor);

    startTransition(async () => {
      const res = await addCategoryAction(formData);
      if (res.error) {
        setCreateError(res.error);
      } else {
        resetCreateForm();
      }
    });
  };

  const handleDeleteClick = (id: string, name: string) => {
    setDeleteError("");
    setDeletingId(id);
    setDeletingName(name);
  };

  const handleConfirmDelete = () => {
    if (!deletingId) return;
    const id = deletingId;
    
    startTransition(async () => {
      const res = await deleteCategoryAction(id);
      if (res.error) {
        setDeleteError(res.error);
        setDeletingId(null);
        setDeletingName("");
      } else {
        setDeletingId(null);
        setDeletingName("");
      }
    });
  };

  const handleCancelDelete = () => {
    setDeletingId(null);
    setDeletingName("");
  };

  const tabs = [
    { id: "expense", label: "Expense" },
    { id: "income", label: "Income" }
  ];

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Manage Categories" maxWidth="480px">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "24px" }}>
        
        {deleteError && (
          <div style={{ padding: "10px 14px", borderRadius: "8px", background: "var(--danger-light)", color: "var(--danger)", fontSize: "14px" }}>
            {deleteError}
          </div>
        )}

        <SegmentedControl 
          options={tabs}
          value={activeTab}
          onChange={(val) => {
            setActiveTab(val);
            resetCreateForm();
            setDeleteError("");
          }}
        />

        {isCreating ? (
          <div className={styles.inlineCreator}>
            <div className={styles.creatorHeader}>
              <span style={{ fontSize: "14px", fontWeight: 600 }}>Create {activeTab === "expense" ? "Expense" : "Income"} Category</span>
              <button type="button" onClick={resetCreateForm} className={styles.iconBtn}><X size={16}/></button>
            </div>
            
            {createError && <div style={{ color: "var(--danger)", fontSize: "12px", marginBottom: "12px" }}>{createError}</div>}
            
            <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
              <div style={{ width: "60px", flexShrink: 0, position: "relative" }}>
                <input 
                  type="text" 
                  className={styles.formInput} 
                  value={newIcon}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) { setNewIcon(""); return; }
                    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
                      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
                      const segments = Array.from(segmenter.segment(val));
                      setNewIcon(segments[segments.length - 1].segment);
                    } else {
                      const chars = Array.from(val);
                      setNewIcon(chars[chars.length - 1]);
                    }
                  }}
                  style={{ textAlign: "center", fontSize: "20px", paddingLeft: "8px", paddingRight: "8px" }}
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
                  style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: color, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {newColor === color && <Check size={12} color="white" />}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" className={styles.btnSecondary} style={{ padding: "6px 12px", fontSize: "13px" }} onClick={resetCreateForm} disabled={isPending}>
                Cancel
              </button>
              <button 
                type="button" 
                className={styles.btnPrimary} 
                style={{ padding: "6px 12px", fontSize: "13px", background: newColor }}
                onClick={handleCreateCategory}
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button 
              className={styles.btnSecondary} 
              style={{ width: "100%", justifyContent: "center", borderStyle: "dashed" }}
              onClick={() => setIsCreating(true)}
            >
              <Plus size={16} /> Add New Category
            </button>

            {filteredCategories.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--text-tertiary)" }}>
                No categories found. Create one to get started.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "400px", overflowY: "auto", paddingRight: "4px" }}>
                {filteredCategories.map(cat => (
                  <div key={cat.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", opacity: isPending ? 0.7 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: cat.color ? `${cat.color}15` : "var(--bg)", color: cat.color || "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", border: cat.color ? `1px solid ${cat.color}30` : "1px solid var(--border)" }}>
                        {cat.icon || "🔖"}
                      </div>
                      <span style={{ fontWeight: 500, fontSize: "15px" }}>{cat.name}</span>
                    </div>
                    {/* Don't show delete button for default hardcoded ones or if it belongs strictly (can add limits later). For now all are deletable. */}
                    <button 
                      onClick={() => handleDeleteClick(cat.id, cat.name)}
                      disabled={isPending}
                      style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "6px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px" }}
                      title="Delete Category"
                      onMouseOver={(e) => e.currentTarget.style.background = "var(--danger-light)"}
                      onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deletingId}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        title="Delete Category"
        message={`Are you sure you want to delete "${deletingName}"?`}
        confirmText="Delete"
        variant="danger"
        isPending={isPending}
      />
    </BaseModal>
  );
}
