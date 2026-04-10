"use client";

import { useUIStore } from "@/store/useUIStore";
import { AddTransactionModal } from "@/components/ui/AddTransactionModal";
import { AddAccountModal } from "@/components/ui/AddAccountModal";
import { AddGoalModal } from "@/components/ui/AddGoalModal";
import { CategoryManagerModal } from "@/components/ui/CategoryManagerModal";

interface DashboardModalsProps {
  accounts: any[];
  categories?: any[];
}

export function DashboardModals({ accounts, categories = [] }: DashboardModalsProps) {
  const { 
    isTransactionModalOpen, setTransactionModalOpen,
    isAddGoalModalOpen, setAddGoalModalOpen,
    isAddAccountModalOpen, setAddAccountModalOpen,
    isCategoryManagerModalOpen, setCategoryManagerModalOpen
  } = useUIStore();
  
  return (
    <>
      <AddTransactionModal 
        isOpen={isTransactionModalOpen}
        onClose={() => setTransactionModalOpen(false)}
        availableAccounts={accounts}
        availableCategories={categories}
      />
      
      <AddAccountModal 
        isOpen={isAddAccountModalOpen}
        onClose={() => setAddAccountModalOpen(false)}
      />

      <AddGoalModal 
        isOpen={isAddGoalModalOpen}
        onClose={() => setAddGoalModalOpen(false)}
      />

      <CategoryManagerModal
        isOpen={isCategoryManagerModalOpen}
        onClose={() => setCategoryManagerModalOpen(false)}
        categories={categories}
      />
    </>
  );
}
