import { getDashboardData } from "@/lib/data/dashboard";
import AccountsView from "@/components/dashboard/AccountsView";
import { EmptyState } from "@/components/ui/EmptyState";
import { Landmark } from "lucide-react";
import styles from "@/components/dashboard/dashboard.module.css";
import { DashboardModals } from "@/components/dashboard/DashboardModals";
import { createClient } from "@/lib/supabase/server";

export default async function AccountsPage() {
  const data = await getDashboardData();
  const hasAccounts = data.accounts && data.accounts.length > 0;

  // Fetch alert profiles so we can display them inline on cards
  let alertProfiles: any[] = [];
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profiles } = await supabase
        .from("account_alert_profiles")
        .select("*")
        .eq("user_id", user.id);
      alertProfiles = profiles || [];
    }
  } catch {
    // Table may not exist yet — silently continue
  }

  return (
    <>
      <AccountsView
        accounts={data.accounts}
        netWorth={data.netWorth}
        currency={data.currency}
        alertProfiles={alertProfiles}
      />
      <DashboardModals accounts={data.accounts} categories={(data as any).categories || []} />
    </>
  );
}
