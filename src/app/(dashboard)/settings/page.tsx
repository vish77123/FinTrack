import { getDashboardData } from "@/lib/data/dashboard";
import { SettingsClient } from "@/components/dashboard/SettingsClient";
import { DashboardModals } from "@/components/dashboard/DashboardModals";

export default async function SettingsPage() {
  const data = await getDashboardData();

  return (
    <>
      <SettingsClient />
      <DashboardModals 
        accounts={data.accounts} 
        categories={(data as any).categories || []} 
      />
    </>
  );
}
