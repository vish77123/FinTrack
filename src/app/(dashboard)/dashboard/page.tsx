import { createClient } from "@/lib/supabase/server";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import SummaryGrid from "@/components/dashboard/SummaryGrid";
import PendingTray from "@/components/dashboard/PendingTray";
import AccountCards from "@/components/dashboard/AccountCards";
import TransactionList from "@/components/dashboard/TransactionList";
import SpendingChart from "@/components/dashboard/SpendingChart";
import SavingsGoals from "@/components/dashboard/SavingsGoals";
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

  return (
    <div>
      <DashboardHeader userName={userName} />
      
      <SummaryGrid />
      
      <PendingTray />
      
      <AccountCards />
      
      <div className={styles.contentGrid}>
        <TransactionList />
        
        <div className={styles.budgetGrid}>
          <SpendingChart />
          <SavingsGoals />
        </div>
      </div>
    </div>
  );
}
