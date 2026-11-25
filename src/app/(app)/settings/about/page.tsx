import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { SettingsPage } from "@/components/settings/section";
import { DemoVideo, DEMO_VIDEO } from "@/components/about/demo-video";
import { aiConfigured } from "@/lib/ai/config";
import { AUTHOR_NAME, PORTFOLIO_URL, REPO_URL } from "@/lib/links";
import { HELP } from "@/lib/help";

export const metadata = { title: "About" };

type Step = { title: string; body: string; href: string; cta: string };

export default function AboutPage() {
  const ai = aiConfigured();

  const steps: Step[] = [
    {
      title: "Bring your history in",
      body: "Import your Expense Tracker workbook or a bank export (CSV or Excel). Rows you already imported are skipped.",
      href: "/settings/data",
      cta: "Import & export",
    },
    {
      title: "Add what you spend",
      body: ai
        ? "Press Add transaction and describe it, e.g. “4.75 Starbucks coffee this morning, 62 Shell gas”. Type it or tap the mic, check the entries, then save. The receipt icon reads a photo or PDF of a bill, line items included. Prefer fields? Switch to Form."
        : "Press Add transaction and fill in the short form. Duplicate a row to repeat a regular expense.",
      href: "/transactions",
      cta: "Transactions",
    },
    {
      title: "Set budgets and everyday categories",
      body: "Give categories a monthly budget; each month carries the last one forward. Mark the categories you control day to day as everyday, so rent and tuition don't hide them.",
      href: "/settings/budgets",
      cta: "Budgets",
    },
    {
      title: "Read your month",
      body: "Overview shows income, total spend, everyday spend and net savings, a calendar of when the money left, and where it went against your budgets.",
      href: "/",
      cta: "Overview",
    },
    {
      title: ai ? "Explore and ask" : "Explore",
      body: ai
        ? "Insights shows where the month is heading and where the money went. On the AI tab, ask your data in plain words, e.g. “How much did I spend at Amazon this year?”"
        : "Insights shows where the month is heading, spent against earned, and where the money went from income to merchants.",
      href: ai ? "/insights?tab=ai" : "/insights",
      cta: "Insights",
    },
    {
      title: "Keep trips and cards in view",
      body: "Tag holiday spending with a trip to keep it out of your monthly numbers. Mark a payment method as a credit card to see what you owe, your next bill and how much of your limit you use.",
      href: "/trips",
      cta: "Trips",
    },
    {
      title: "Use the keyboard",
      body: "Every page works without a mouse. Press ? to see the shortcuts, ⌘K (Ctrl+K on Windows) to jump to any page or setting, N to add a transaction, and G then T to open Transactions. Change any of them in Settings.",
      href: "/settings/shortcuts",
      cta: "Keyboard shortcuts",
    },
  ];

  return (
    <SettingsPage title="About" info={HELP.about} description="What Spend Analyser does and how to get the most out of it">
      <Card>
        <CardHeader title="Watch the tour" subtitle={`${DEMO_VIDEO.seconds} seconds, recorded on a demo account with made-up data`} />
        <DemoVideo />
      </Card>

      <Card>
        <CardHeader title="How to use it" subtitle="Seven steps, roughly in the order you'll need them" />
        <ol className="divide-y divide-border">
          {steps.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-x-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[2rem_1fr_auto] sm:items-start">
              <span className="pt-0.5 font-mono text-sm tabular-nums text-faint">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-text">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
              <Link
                href={s.href}
                className="col-start-2 mt-2 inline-flex w-fit items-center gap-1 text-sm text-accent underline-offset-2 hover:underline sm:col-start-3 sm:mt-0"
              >
                {s.cta}
                <ArrowRight size={16} />
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader title="Made in the open" subtitle="Spend Analyser is open source under the MIT license" />
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            { href: REPO_URL, label: "Source on GitHub", desc: "Code, issues and how to self-host" },
            { href: PORTFOLIO_URL, label: `Made by ${AUTHOR_NAME}`, desc: "Portfolio and other projects" },
          ].map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-full items-start justify-between gap-3 rounded-control border border-border bg-surface-2 p-compact transition-colors hover:bg-surface-3"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">{l.label}</span>
                  <span className="text-xs text-muted">{l.desc}</span>
                  <span className="truncate text-xs text-faint">{l.href.replace(/^https:\/\//, "").replace(/\/$/, "")}</span>
                </span>
                <ArrowUpRight size={16} className="mt-0.5 shrink-0 text-muted" />
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </SettingsPage>
  );
}
