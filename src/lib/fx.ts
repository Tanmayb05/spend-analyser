import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/dates";

// Free, keyless FX source (150+ currencies, daily history). Primary on jsDelivr, fallback on Cloudflare Pages.
const SOURCES = [
  (date: string, base: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${base}.min.json`,
  (date: string, base: string) => `https://${date}.currency-api.pages.dev/v1/currencies/${base}.min.json`,
];

async function fetchRates(date: string, base: string): Promise<Record<string, number> | null> {
  const b = base.toLowerCase();
  for (const src of SOURCES) {
    try {
      const res = await fetch(src(date, b), { next: { revalidate: 86_400 } });
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, unknown>;
      const rates = json[b] as Record<string, number> | undefined;
      if (rates && typeof rates === "object") return rates;
    } catch {
      // try next source
    }
  }
  return null;
}

/**
 * Rate to convert 1 unit of `from` into `to` on `date` (YYYY-MM-DD).
 * Future dates use the latest rate. Results are cached in public.fx_rates.
 */
export async function getRate(date: string, from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const today = todayIn("UTC");
  const day = date > today ? today : date;
  const admin = createAdminClient();

  const cached = await admin.from("fx_rates").select("rate").eq("date", day).eq("base", from).eq("quote", to).maybeSingle();
  if (cached.data?.rate) return Number(cached.data.rate);

  const rates = (await fetchRates(day, from)) ?? (await fetchRates("latest", from));
  const rate = rates?.[to.toLowerCase()];
  if (!rate || !(rate > 0)) throw new Error(`No exchange rate for ${from}→${to} on ${day}`);

  const rows = Object.entries(rates)
    .filter(([q, r]) => /^[a-z]{3}$/.test(q) && typeof r === "number" && r > 0)
    .map(([q, r]) => ({ date: day, base: from, quote: q.toUpperCase(), rate: r }));
  await admin.from("fx_rates").upsert(rows, { onConflict: "date,base,quote", ignoreDuplicates: true });

  return rate;
}
