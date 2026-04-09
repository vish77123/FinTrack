import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/data/dashboard";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import SummaryGrid from "@/components/dashboard/SummaryGrid";
import PendingTray from "@/components/dashboard/PendingTray";
import AccountCards from "@/components/dashboard/AccountCards";
import TransactionList from "@/components/dashboard/TransactionList";
import SpendingChart from "@/components/dashboard/SpendingChart";
import SavingsGoals from "@/components/dashboard/SavingsGoals";
import { DashboardModals } from "@/components/dashboard/DashboardModals";
import styles from "@/components/dashboard/dashboard.module.css";

export default async function DashboardPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const isPlaceholder = supabaseUrl.includes("placeholder");

  let userName = "Rahul K.";

  if (!isPlaceholder) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      
      userName = profile?.display_name || user.user_metadata?.full_name || "User";
    }
  }

  const dashboardData = await getDashboardData();

  return (
    <div>
      <DashboardHeader userName={userName} />
      
      <SummaryGrid 
        netWorth={dashboardData.netWorth}
        income={dashboardData.income}
        expenses={dashboardData.expenses}
        savings={dashboardData.savings}
        currency={dashboardData.currency}
      />
      
      <PendingTray items={dashboardData.pendingTransactions} currency={dashboardData.currency} />
      
      <AccountCards accounts={dashboardData.accounts} currency={dashboardData.currency} />
      
      <div className={styles.contentGrid}>
        <TransactionList items={dashboardData.recentTransactions} currency={dashboardData.currency} />
        
        <div className={styles.budgetGrid}>
          <SpendingChart data={dashboardData.spendingData} />
          <SavingsGoals goals={dashboardData.savingsGoals} currency={dashboardData.currency} />
        </div>
      </div>
      
      <DashboardModals accounts={dashboardData.accounts} categories={(dashboardData as any).categories || []} />
    </div>
  );
}
