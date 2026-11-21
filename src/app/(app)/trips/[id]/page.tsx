import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatStrip } from "@/components/cards/stat-strip";
import { TripHeaderActions } from "@/components/trips/trip-actions";
import { MODE_COPY } from "@/lib/trip-modes";
import { TxnList } from "@/components/transactions/txn-list";
import { tripPartColors } from "@/components/charts/colors";
import { getReferenceData } from "@/lib/data/reference";
import { getTripStats, tripDays } from "@/lib/data/trips";
import { getLedger } from "@/lib/data/ledger";
import { formatDay } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
import { HELP } from "@/lib/help";

export default async function TripPage({ params }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  const ref = await getReferenceData();
  const trip = ref.trips.find((t) => t.id === id);
  if (!trip) notFound();
  const currency = ref.profile.base_currency;
  const s = (await getTripStats(id)).get(id);
  const start = trip.start_date ?? s?.first ?? null;
  const end = trip.end_date ?? s?.last ?? null;
  const days = tripDays(start, end);
  const total = s?.total ?? 0;

  const rows = (await getLedger("1900-01-01", "2999-12-31", true)).filter((r) => r.trip_id === id && !r.is_lump);

  const parts = Object.entries(s?.bySub ?? {})
    .map(([k, v]) => {
      if (k.startsWith("cat:")) {
        const c = ref.categories.find((x) => x.id === k.slice(4));
        return { label: c?.name ?? "Other", value: v };
      }
      const sub = ref.subcategories.find((x) => x.id === k);
      return { label: sub?.name ?? "Other", value: v };
    })
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);
  // merge same labels (e.g. "Food" under different categories)
  const mergedParts = [...parts.reduce((m, p) => m.set(p.label, { ...p, value: (m.get(p.label)?.value ?? 0) + p.value }), new Map<string, (typeof parts)[number]>()).values()].sort((a, b) => b.value - a.value);
  // each part gets its own color: Flights / Stay / Food are fixed, the rest rotate (not the parent category's single color)
  const colors = tripPartColors(mergedParts.map((p) => p.label));
  const merged = mergedParts.map((p) => ({ ...p, color: colors.get(p.label)! }));

  return (
    <>
      <Link href="/trips" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ChevronLeft size={16} />Trips</Link>
      <div className="mb-5 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">{trip.name}</h1>
          <p className="mt-1 text-sm text-muted">{start ? `${formatDay(start)}${end && end !== start ? ` – ${formatDay(end)}` : ""}` : "No dates yet"}</p>
        </div>
        <TripHeaderActions trip={trip} />
      </div>

      <StatStrip
        stats={[
          { label: "Total spent", value: formatMoney(total, currency, { whole: true }), money: true },
          { label: "Per day", value: days ? formatMoney(total / days, currency, { whole: true }) : "–", money: days > 0 },
          { label: "Expenses", value: String(s?.count ?? 0) },
          { label: "Budget", value: trip.budget ? `${formatPercent(total / Number(trip.budget))} of ${formatMoney(Number(trip.budget), currency, { whole: true })}` : "Not set" },
        ]}
      />

      <section className="mt-4 grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Counted in monthly spending?" info={HELP.tripMode} action={<Badge tone="neutral" className="shrink-0 whitespace-nowrap">{MODE_COPY[trip.include_mode].title}</Badge>} />
            <p className="text-sm text-muted">{MODE_COPY[trip.include_mode].body}</p>
            {trip.include_mode === "lump_sum" ? (
              <p className="mt-2 text-sm text-muted">
                Counts as {formatMoney(total, currency, { whole: true })} in {ref.categories.find((c) => c.id === trip.lump_category_id)?.name}
                {trip.lump_spread_months && trip.lump_spread_months > 1 ? `, spread over ${trip.lump_spread_months} months` : ""}.
              </p>
            ) : null}
            <p className="mt-3 text-xs text-faint">Change it with Edit</p>
          </Card>
          <Card>
            <CardHeader title="Where did the trip money go?" info={HELP.tripBreakdown} />
            {merged.length ? (
              <>
                <div className="flex h-2 gap-px overflow-hidden rounded-inset">
                  {merged.map((p) => (
                    <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={p.label} />
                  ))}
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {merged.map((p) => (
                    <li key={p.label} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                      <span className="flex-1">{p.label}</span>
                      <span className="num text-muted">{formatPercent(p.value / total)}</span>
                      <span className="money w-20 text-right">{formatMoney(p.value, currency, { whole: true })}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted">No expenses yet</p>
            )}
          </Card>
        </div>
        <Card className="min-w-0">
          {rows.length ? <TxnList rows={rows} /> : <p className="py-10 text-center text-sm text-muted">No expenses tagged with this trip yet</p>}
        </Card>
      </section>
    </>
  );
}
