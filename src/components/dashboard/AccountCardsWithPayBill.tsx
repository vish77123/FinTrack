"use client";

import { useState } from "react";
import AccountCards from "@/components/dashboard/AccountCards";
import { useUIStore } from "@/store/useUIStore";

interface AccountCardsWithPayBillProps {
  accounts: any[];
  currency: string;
}

/**
 * Client wrapper that connects the AccountCards "Pay Bill" button
 * to the global transaction modal via Zustand, with pre-fill state.
 *
 * This is necessary because AccountCards is now a client component needing
 * access to Zustand, while the dashboard page is a server component.
 */
export function AccountCardsWithPayBill({ accounts, currency }: AccountCardsWithPayBillProps) {
  const { setTransactionModalOpen } = useUIStore();
  const [payBillTarget, setPayBillTarget] = useState<any | null>(null);

  const handlePayBill = (ccAccount: any) => {
    window.dispatchEvent(new CustomEvent("fintrack:paybill", {
      detail: {
        transferTo: ccAccount.id,
        // Default to currentDue (billed amount); fall back to outstanding if no statement_day
        amount: ccAccount.currentDue ?? ccAccount.outstanding_balance ?? 0,
        ccName: ccAccount.name,
      }
    }));
    setTransactionModalOpen(true);
  };

  return (
    <AccountCards
      accounts={accounts}
      currency={currency}
      onPayBill={handlePayBill}
    />
  );
}
