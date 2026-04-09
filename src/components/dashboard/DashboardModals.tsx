"use client";

import { useUIStore } from "@/store/useUIStore";
import { AddTransactionModal } from "@/components/ui/AddTransactionModal";
import { AddAccountModal } from "@/components/ui/AddAccountModal";
import { AddGoalModal } from "@/components/ui/AddGoalModal";

interface DashboardModalsProps {
  accounts: any[];
  categories?: any[];
}

export function DashboardModals({ accounts, categories = [] }: DashboardModalsProps) {
  const { 
    isTransactionModalOpen, setTransactionModalOpen,
    isAddGoalModalOpen, setAddGoalModalOpen,
    isAddAccountModalOpen, setAddAccountModalOpen
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
    </>
  );
}
