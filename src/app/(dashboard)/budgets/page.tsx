import { getDashboardData } from "@/lib/data/dashboard";
import BudgetsView from "@/components/dashboard/BudgetsView";
import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardModals } from "@/components/dashboard/DashboardModals";
import { PieChart } from "lucide-react";
import styles from "@/components/dashboard/dashboard.module.css";

export default async function BudgetsPage() {
  const data = await getDashboardData();
  const hasGoals = data.savingsGoals && data.savingsGoals.length > 0;

  return (
    <>
      {!hasGoals ? (
        <div className={styles.section}>
          <div className={styles.pageHeader}>
            <div>
              <h1>Budgets & Goals</h1>
              <p>Take control of your money by mapping out your targets.</p>
            </div>
          </div>
          <EmptyState 
            icon={<PieChart size={48} />}
            title="No budgets set"
            description="Create your first monthly limit or savings goal to see it here."
          />
        </div>
      ) : (
        <BudgetsView goals={data.savingsGoals} currency={data.currency} />
      )}
      <DashboardModals accounts={data.accounts} categories={(data as any).categories || []} />
    </>
  );
}
