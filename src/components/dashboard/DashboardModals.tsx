"use client";

import { useState, useEffect } from "react";
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

  // "Pay Bill" state — holds pre-fill data when triggered from AccountCards
  const [payBillPrefill, setPayBillPrefill] = useState<{
    transferTo: string;
    amount: number;
    ccName: string;
  } | null>(null);

  // Listen for the custom "pay bill" event dispatched by AccountCardsWithPayBill
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setPayBillPrefill({
        transferTo: detail.transferTo,
        amount: detail.amount,
        ccName: detail.ccName || "",
      });
    };
    window.addEventListener("fintrack:paybill", handler);
    return () => window.removeEventListener("fintrack:paybill", handler);
  }, []);

  const handleCloseTransaction = () => {
    setTransactionModalOpen(false);
    setPayBillPrefill(null);
  };

  return (
    <>
      <AddTransactionModal 
        isOpen={isTransactionModalOpen}
        onClose={handleCloseTransaction}
        availableAccounts={accounts}
        availableCategories={categories}
        prefillTransferTo={payBillPrefill?.transferTo}
        prefillAmount={payBillPrefill?.amount}
        prefillNote={payBillPrefill?.ccName ? `${payBillPrefill.ccName} bill payment` : undefined}
        prefillTab={payBillPrefill ? "transfer" : undefined}
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
