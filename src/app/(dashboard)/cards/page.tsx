import { CardsView } from "@/components/dashboard/CardsView";
import { getCardsData } from "@/lib/data/cards";

export default async function CardsPage() {
  const data = await getCardsData();
  return <CardsView cards={data.cards} contacts={data.contacts} loadError={data.error} />;
}
