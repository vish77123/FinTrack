import { getDashboardData } from "@/lib/data/dashboard";
import ReportsView from "@/components/dashboard/ReportsView";
import { EmptyState } from "@/components/ui/EmptyState";
import { LineChart } from "lucide-react";
import styles from "@/components/dashboard/dashboard.module.css";

export default async function ReportsPage() {
  const data = await getDashboardData();
  const hasData = data.spendingData && data.spendingData.length > 0;

  return (
    <>
      {!hasData ? (
        <div className={styles.section}>
          <div className={styles.pageHeader}>
            <div>
              <h1>Reports</h1>
              <p>Analyze your financial health over time.</p>
            </div>
          </div>
          <EmptyState 
            icon={<LineChart size={48} />}
            title="Not enough data"
            description="Generate detailed reports by adding more transactions to your ledger."
          />
        </div>
      ) : (
        <ReportsView spendingData={data.spendingData} currency={data.currency} />
      )}
    </>
  );
}
