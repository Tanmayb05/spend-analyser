import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/supabase/server";
import { getReferenceData } from "@/lib/data/reference";
import { getLedger } from "@/lib/data/ledger";
import { getCardData } from "@/lib/data/cards";
import { getAiUsage } from "@/lib/ai/usage";
import { QUOTA_UNIT, type QuotaGroup } from "@/lib/ai/config";
import { countCategorizeCandidates } from "@/app/(app)/ai/tidy-actions";
import { addMonths, monthEnd, monthStart } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { budgetTotals, budgetsForMonth } from "@/lib/analytics/budgets";
import { byCategory, lastMonths, monthlySeries } from "@/lib/analytics/summary";
import { ruleInsights } from "@/lib/analytics/insights";
import {
  aiNotices,
  applyState,
  budgetNotices,
  cardNotices,
  committedNotice,
  emiNotices,
  insightNotices,
  tripNotices,
  type NoticeState,
} from "@/lib/notifications/rules";
import type { Notice } from "@/lib/notifications/types";

/** A failing source should cost one notice type, not the whole inbox. */
async function safe<T>(label: string, p: Promise<T> | (() => Promise<T>), fallback: T): Promise<T> {
  try {
    return await (typeof p === "function" ? p() : p);
  } catch (e) {
    console.error(`[notifications] ${label} failed:`, e instanceof Error ? e.message : e);
    return fallback;
  }
}

/** Every notice for the signed-in user, minus dismissed/snoozed ones, with read state. Computed per request. */
export const getNotifications = cache(async (): Promise<Notice[]> => {
  const ref = await getReferenceData();
  const { supabase } = await requireUser();
  const { today, categories, profile } = ref;
  const currency = profile.base_currency;
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const month = monthStart(today);
  const lastMonth = addMonths(month, -1);
  const nextMonth = addMonths(month, 1);
  const since24h = new Date(Date.now() - 86_400_000).toISOString();

  const [rows, cards, usage, review, flags, errors, tidy] = await Promise.all([
    safe("ledger", getLedger(addMonths(month, -4), monthEnd(nextMonth)), []),
    safe("cards", getCardData(), []),
    safe("usage", getAiUsage(), null),
    safe("review", async () => (await supabase.from("ai_insights").select("result").eq("scope_key", `month|${lastMonth}`).order("created_at", { ascending: false }).limit(1).maybeSingle()).data, null),
    safe("flags", async () => (await supabase.from("ai_flags").select("id, kind").eq("dismissed", false).order("created_at", { ascending: false }).limit(200)).data ?? [], []),
    safe("ai errors", async () => (await supabase.from("ai_call_log").select("id", { count: "exact", head: true }).eq("status", "error").gte("created_at", since24h)).count ?? 0, 0),
    ref.aiReady ? safe("tidy", countCategorizeCandidates(), 0) : Promise.resolve(0),
  ]);

  const notices: Notice[] = [];
  notices.push(...cardNotices(cards.map((c) => c.summary), today, money));

  // budgets + rule insights: same inputs the overview used for its banner
  const resolved = budgetsForMonth(ref.budgets, categories, month);
  const totals = budgetTotals(resolved, categories);
  const spent = new Map(byCategory(rows, month, today).map((c) => [c.categoryId, c.spent]));
  const lines = categories
    .filter((c) => c.kind === "expense" && !c.archived)
    .map((c) => ({ categoryId: c.id, name: c.name, spent: spent.get(c.id) ?? 0, budget: resolved.get(c.id)?.amount ?? 0 }));
  notices.push(...budgetNotices(lines, month, today, money));

  const series = monthlySeries(rows, lastMonths(month, 4), today);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  notices.push(...insightNotices(ruleInsights({ rows, series, month, today, budgets: resolved, totals, categoryName: catName, currency }, 20), month, today));

  notices.push(...emiNotices(rows, today, money));
  const committed = rows.filter((r) => r.month === nextMonth).reduce((a, r) => a + Number(r.spend), 0);
  notices.push(...committedNotice(committed, budgetTotals(budgetsForMonth(ref.budgets, categories, nextMonth), categories).total, nextMonth, today, money));

  const lastActive = series.some((s) => s.month === lastMonth && (s.spent > 0 || s.income > 0));
  notices.push(
    ...aiNotices(
      {
        aiReady: ref.aiReady,
        review: lastActive ? { month: lastMonth, cached: (review?.result as { headline: string; summary: string } | undefined) ?? null, left: usage?.analysis.left ?? 0 } : null,
        flags: { count: flags.length, duplicates: flags.filter((f) => f.kind === "duplicate").length, newestId: flags[0]?.id ?? null },
        tidy,
        allowance: usage ? (Object.keys(usage) as QuotaGroup[]).map((g) => ({ group: g, unit: QUOTA_UNIT[g], ...usage[g] })) : [],
        errors24h: errors,
      },
      today,
    ),
  );
  notices.push(...tripNotices(ref.trips, today));

  const ids = notices.map((n) => n.id);
  const states = ids.length
    ? await safe("state", async () => ((await supabase.from("notification_state").select("notice_id, read_at, dismissed_at, snoozed_until").in("notice_id", ids)).data ?? []) as NoticeState[], [])
    : [];
  return applyState(notices, states, today);
});
