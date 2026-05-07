import { getInvestmentsData } from "@/lib/data/investments";
import InvestmentsView from "@/components/dashboard/InvestmentsView";
import { getDashboardData } from "@/lib/data/dashboard";

export default async function InvestmentsPage() {
  const [investments, dashboard] = await Promise.all([
    getInvestmentsData(),
    getDashboardData(),
  ]);

  return <InvestmentsView data={investments} currency={dashboard.currency} />;
}
