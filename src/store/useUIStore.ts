import { create } from "zustand";

interface UIState {
  theme: "light" | "dark";
  isTransactionModalOpen: boolean;
  isAddGoalModalOpen: boolean;
  isAddAccountModalOpen: boolean;
  isCategoryManagerModalOpen: boolean;
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
  setTransactionModalOpen: (isOpen: boolean) => void;
  setAddGoalModalOpen: (isOpen: boolean) => void;
  setAddAccountModalOpen: (isOpen: boolean) => void;
  setCategoryManagerModalOpen: (isOpen: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: (typeof window !== "undefined" ? (localStorage.getItem("theme") as "light" | "dark") : null) || "light",
  isTransactionModalOpen: false,
  isAddGoalModalOpen: false,
  isAddAccountModalOpen: false,
  isCategoryManagerModalOpen: false,
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
  setTransactionModalOpen: (isOpen) => set({ isTransactionModalOpen: isOpen }),
  setAddGoalModalOpen: (isOpen) => set({ isAddGoalModalOpen: isOpen }),
  setAddAccountModalOpen: (isOpen) => set({ isAddAccountModalOpen: isOpen }),
  setCategoryManagerModalOpen: (isOpen) => set({ isCategoryManagerModalOpen: isOpen }),
}));
