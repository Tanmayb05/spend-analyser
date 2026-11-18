import { Card } from "@/components/ui/card";
import { SettingsPage } from "@/components/settings/section";
import { CategorizePanel, ItemsPanel, MerchantsPanel } from "@/components/ai/tidy-panels";
import { countCategorizeCandidates, countItemCandidates } from "@/app/(app)/ai/tidy-actions";
import { getReferenceData } from "@/lib/data/reference";
import { getAiUsage } from "@/lib/ai/usage";
import { HELP } from "@/lib/help";

export const metadata = { title: "AI tidy-up" };

export default async function TidyPage() {
  const ref = await getReferenceData();
  const [usage, toCategorize, items] = await Promise.all([getAiUsage(), countCategorizeCandidates(), countItemCandidates()]);
  const common = { ready: ref.aiReady, left: usage.organize.left };
  return (
    <SettingsPage
      title="AI tidy-up"
      info={HELP.tidy}
      description={`The AI suggests fixes; nothing changes until you apply them. Each Suggest uses one of your ${usage.organize.limit} monthly tidy-up runs (${usage.organize.left} left).`}
    >
      {!ref.aiReady ? (
        <Card>
          <p className="text-sm text-muted">AI isn&apos;t available: it&apos;s either not configured on the server or turned off for your account (Settings → AI).</p>
        </Card>
      ) : null}
      <CategorizePanel {...common} candidates={toCategorize} currency={ref.profile.base_currency} />
      <MerchantsPanel {...common} total={ref.merchants.length} />
      <ItemsPanel {...common} candidates={items} />
    </SettingsPage>
  );
}
