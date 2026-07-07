import { notFound } from "next/navigation";
import { StatementDetailView } from "@/components/dashboard/StatementDetailView";
import { DashboardModals } from "@/components/dashboard/DashboardModals";
import { getStatementDetail } from "@/lib/data/cards";

export default async function StatementPage({
  params,
}: {
  params: Promise<{ statementId: string }>;
}) {
  const { statementId } = await params;
  const data = await getStatementDetail(statementId);
  if (!data) notFound();

  return (
    <>
      <StatementDetailView
        statement={data.statement}
        lines={data.lines}
        candidateTransactions={data.candidateTransactions}
        contacts={data.contacts}
        categories={data.categories}
        loadError={data.error}
      />
      {/* Shared app modals — line edits open the real Add/Edit Transaction modal */}
      <DashboardModals accounts={data.accounts} categories={data.categories} />
    </>
  );
}
