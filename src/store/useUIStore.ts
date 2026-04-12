import { create } from "zustand";

interface EditingTransaction {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  account_id: string;
  category_id?: string | null;
  date: string;
  note?: string;
  source: "transaction" | "pending"; // which table it came from
  isSplitChild?: boolean;            // child of a split group → hide split toggle
  splitGroupId?: string;             // set when editing the whole split parent
  splitChildren?: any[];             // pre-filled split rows when editing parent
}

interface UIState {
  theme: "light" | "dark";
  isTransactionModalOpen: boolean;
  isAddGoalModalOpen: boolean;
  isAddAccountModalOpen: boolean;
  isCategoryManagerModalOpen: boolean;
  editingTransaction: EditingTransaction | null;
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
  setTransactionModalOpen: (isOpen: boolean) => void;
  setAddGoalModalOpen: (isOpen: boolean) => void;
  setAddAccountModalOpen: (isOpen: boolean) => void;
  setCategoryManagerModalOpen: (isOpen: boolean) => void;
  setEditingTransaction: (txn: EditingTransaction | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: (typeof window !== "undefined" ? (localStorage.getItem("theme") as "light" | "dark") : null) || "light",
  isTransactionModalOpen: false,
  isAddGoalModalOpen: false,
  isAddAccountModalOpen: false,
  isCategoryManagerModalOpen: false,
  editingTransaction: null,
  setTheme: (theme) => {
    if (typeof window !== "undefined") localStorage.setItem("theme", theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      if (typeof window !== "undefined") localStorage.setItem("theme", next);
      return { theme: next };
    }),
  setTransactionModalOpen: (isOpen) => set({ isTransactionModalOpen: isOpen, ...(!isOpen && { editingTransaction: null }) }),
  setAddGoalModalOpen: (isOpen) => set({ isAddGoalModalOpen: isOpen }),
  setAddAccountModalOpen: (isOpen) => set({ isAddAccountModalOpen: isOpen }),
  setCategoryManagerModalOpen: (isOpen) => set({ isCategoryManagerModalOpen: isOpen }),
  setEditingTransaction: (txn) => set({ editingTransaction: txn, isTransactionModalOpen: !!txn }),
}));
