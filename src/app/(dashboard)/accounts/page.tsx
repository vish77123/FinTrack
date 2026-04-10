import { getDashboardData } from "@/lib/data/dashboard";
import AccountsView from "@/components/dashboard/AccountsView";
import { EmptyState } from "@/components/ui/EmptyState";
import { Landmark } from "lucide-react";
import styles from "@/components/dashboard/dashboard.module.css";
import { DashboardModals } from "@/components/dashboard/DashboardModals";

export default async function AccountsPage() {
  const data = await getDashboardData();
  const hasAccounts = data.accounts && data.accounts.length > 0;

  return (
    <>
      {!hasAccounts ? (
        <div className={styles.section}>
          <div className={styles.pageHeader}>
            <div>
              <h1>Accounts</h1>
              <p>Manage your bank accounts, cards, and wallets.</p>
            </div>
          </div>
          <EmptyState 
            icon={<Landmark size={48} />}
            title="No accounts found"
            description="Add your bank accounts, credit cards, or cash wallets to get started."
          />
        </div>
      ) : (
        <AccountsView accounts={data.accounts} netWorth={data.netWorth} currency={data.currency} />
      )}
      
      <DashboardModals accounts={data.accounts} categories={(data as any).categories || []} />
    </>
  );
}
