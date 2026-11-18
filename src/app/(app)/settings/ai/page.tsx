import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsPage } from "@/components/settings/section";
import { getAiUsage } from "@/lib/ai/usage";
import { AI, aiConfigured } from "@/lib/ai/config";
import { HELP } from "@/lib/help";

export const metadata = { title: "AI" };

export default async function AiSettingsPage() {
  const usage = await getAiUsage();
  const configured = aiConfigured();
  const meters = [
    { label: "Deep analyses", ...usage.analysis, desc: `${AI.label} reviews your monthly totals and writes insights.` },
    { label: "Smart entry", ...usage.parse, desc: "Typed sentences, receipts (PDF/photo) and Drive links turned into transactions." },
    { label: "Tidy-up runs", ...usage.organize, desc: "Category, merchant and item-name suggestions, and the unusual-spending check." },
    { label: "Questions", ...usage.chat, desc: "Ask your data on the Insights page." },
  ];
  return (
    <SettingsPage title="AI" info={HELP.ai} description="AI features are limited per month to keep costs predictable. Limits reset on the 1st.">
      <Card>
        <CardHeader title="Status" action={<Badge tone={configured ? "good" : "warn"}>{configured ? "Connected" : "Not configured"}</Badge>} />
        <p className="text-sm text-muted">
          {configured
            ? `Provider: ${AI.label}. Using ${AI.models.fast} for entry/receipts and ${AI.models.smart} for analysis.`
            : `Set ${AI.keyEnv} on the server (see .env.example) to enable smart entry, receipt reading and deep analysis. Everything else works without it.`}
        </p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {meters.map((m) => (
          <Card key={m.label}>
            <p className="text-xs uppercase tracking-wide text-muted">{m.label}</p>
            <p className="num mt-2 text-3xl font-medium">
              {m.left}
              <span className="text-lg text-muted"> / {m.limit} left</span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (m.used / Math.max(m.limit, 1)) * 100)}%` }} />
            </div>
            <p className="mt-3 text-sm text-muted">{m.desc}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title={`What is sent to ${AI.label}`} />
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Smart entry: the sentence you type, plus your category and merchant names so it can pick the right ones.</li>
          <li>Receipts: the file you upload or link, to read the merchant, date, total and line items.</li>
          <li>Deep analysis and the monthly digest: monthly totals per category, budgets and top merchants. Never individual transactions or notes.</li>
          <li>Tidy-up: for categorising, up to 50 transactions (date, amount, merchant, description); for merchants, names and counts; for items, printed product names. Never notes.</li>
          <li>Unusual-spending check: only the entries an automatic check flagged (date, amount, category, merchant, description).</li>
          <li>Ask your data: your question, plus the summaries the AI asks for (totals, top merchants, up to 25 matching entries).</li>
          <li>Nothing is sent unless you press a button. Results are cached, so viewing them again is free.</li>
        </ul>
      </Card>
    </SettingsPage>
  );
}
