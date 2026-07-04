import { getDashboardData, getDefaultTxnWindowStart, hasAnyTransactions } from "@/lib/data/dashboard";
import TransactionsView from "@/components/dashboard/TransactionsView";
import { EmptyState } from "@/components/ui/EmptyState";
import { Receipt } from "lucide-react";
import styles from "@/components/dashboard/dashboard.module.css";
import { DashboardModals } from "@/components/dashboard/DashboardModals";

export default async function TransactionsPage() {
  const data = await getDashboardData();
  const windowStart = getDefaultTxnWindowStart();

  // recentTransactions only covers the default window (last two months), so an
  // empty window doesn't mean the user has no history — older transactions are
  // reachable through the date filter. Only show the first-run empty state
  // when there is truly nothing.
  const hasWindowTransactions = data.recentTransactions && data.recentTransactions.length > 0;
  const hasAny = hasWindowTransactions || (await hasAnyTransactions());

  return (
    <>
      {!hasAny ? (
        <div className={styles.section}>
          <EmptyState
            icon={<Receipt size={48} />}
            title="No transactions yet"
            description="Start tracking your spending by adding your first transaction."
          />
        </div>
      ) : (
        <TransactionsView
          transactions={data.recentTransactions}
          currency={data.currency}
          categories={(data as any).categories || []}
          accounts={data.accounts || []}
          windowStart={windowStart}
        />
      )}

      {/* Include modals so the "Add Transaction" CTA directly on this page triggers perfectly */}
      <DashboardModals accounts={data.accounts} categories={(data as any).categories || []} />
    </>
  );
}
