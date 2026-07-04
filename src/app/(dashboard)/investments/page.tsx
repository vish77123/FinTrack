import { getInvestmentsData } from "@/lib/data/investments";
import InvestmentsView from "@/components/dashboard/InvestmentsView";
import { CURRENCY_SYMBOL } from "@/lib/data/currency";

export default async function InvestmentsPage() {
  const investments = await getInvestmentsData();

  return <InvestmentsView data={investments} currency={CURRENCY_SYMBOL} />;
}
