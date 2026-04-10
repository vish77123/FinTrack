import { getBudgetsData } from "@/lib/data/budgets";
import BudgetsView from "@/components/dashboard/BudgetsView";
import { DashboardModals } from "@/components/dashboard/DashboardModals";
import { getDashboardData } from "@/lib/data/dashboard";

export default async function BudgetsPage() {
  const [budgetData, dashData] = await Promise.all([
    getBudgetsData(),
    getDashboardData(),
  ]);

  return (
    <>
      <BudgetsView
        budgets={budgetData.budgets}
        categories={budgetData.categories}
        currency={budgetData.currency}
        daysLeft={budgetData.daysLeft}
      />
      <DashboardModals
        accounts={dashData.accounts}
        categories={(dashData as any).categories || []}
      />
    </>
  );
}
