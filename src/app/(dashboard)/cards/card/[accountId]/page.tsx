import { notFound } from "next/navigation";
import { CardDetailView } from "@/components/dashboard/CardDetailView";
import { getCardDetail } from "@/lib/data/cards";

export default async function CardPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const data = await getCardDetail(accountId);
  if (!data) notFound();

  return <CardDetailView card={data.card} statements={data.statements} loadError={data.error} />;
}
