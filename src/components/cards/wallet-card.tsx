import { Card, CardHeader } from "@/components/ui/card";
import { WalletStack } from "./wallet-stack";
import { getReferenceData } from "@/lib/data/reference";
import { getCardData } from "@/lib/data/cards";
import { recentlyUsed } from "@/lib/cards";

const SHOWN = 5;

/** Overview: the five most recently used credit cards in a wallet. Renders nothing when there are none. */
export async function WalletCard() {
  const ref = await getReferenceData();
  const cards = await getCardData();
  if (!cards.length) return null;
  const items = recentlyUsed(
    cards.map((c) => {
      const pm = ref.paymentMethods.find((p) => p.id === c.summary.card.id)!;
      return { id: pm.id, name: pm.name, color: pm.color, lastUsed: c.lastUsed };
    }),
    SHOWN,
  );
  return (
    <Card>
      <CardHeader title="Cards" subtitle={cards.length > SHOWN ? `Your ${SHOWN} most recently used` : "Your credit cards"} />
      <WalletStack items={items} />
    </Card>
  );
}
