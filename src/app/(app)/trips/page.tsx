import Link from "next/link";
import { Plane } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { NewTripButton } from "@/components/trips/trip-actions";
import { MODE_COPY } from "@/lib/trip-modes";
import { getReferenceData } from "@/lib/data/reference";
import { getTripStats, tripDays } from "@/lib/data/trips";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { InfoTitle } from "@/components/ui/info-title";
import { HELP } from "@/lib/help";

export const metadata = { title: "Trips" };

export default async function TripsPage() {
  const ref = await getReferenceData();
  const stats = await getTripStats();
  const currency = ref.profile.base_currency;
  const trips = [...ref.trips].sort((a, b) => (stats.get(b.id)?.last ?? b.start_date ?? "").localeCompare(stats.get(a.id)?.last ?? a.start_date ?? ""));
  const total = [...stats.values()].reduce((a, s) => a + s.total, 0);
  const excluded = ref.trips.filter((t) => t.include_mode === "excluded").reduce((a, t) => a + (stats.get(t.id)?.total ?? 0), 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <InfoTitle as="h1" info={HELP.trips} className="text-3xl font-medium sm:text-4xl" panelClassName="max-w-xl">Trips</InfoTitle>
          <p className="mt-1 text-sm text-muted">
            {formatMoney(total, currency, { whole: true })} across {trips.length} trips · {formatMoney(excluded, currency, { whole: true })} kept out of monthly spending
          </p>
        </div>
        <NewTripButton />
      </div>
      {trips.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {trips.map((t) => {
            const s = stats.get(t.id);
            const start = t.start_date ?? s?.first ?? null;
            const end = t.end_date ?? s?.last ?? null;
            const days = tripDays(start, end);
            const spent = s?.total ?? 0;
            const ratio = t.budget ? spent / Number(t.budget) : null;
            return (
              <Link key={t.id} href={`/trips/${t.id}`}>
                <Card className="h-full transition hover:bg-surface-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-surface-3 text-muted"><Plane size={18} /></span>
                    <Badge tone={t.include_mode === "excluded" ? "neutral" : "accent"}>{MODE_COPY[t.include_mode].title}</Badge>
                  </div>
                  <p className="mt-4 truncate text-lg font-medium">{t.name}</p>
                  <p className="text-xs text-muted">{start ? `${formatDay(start)}${end && end !== start ? ` – ${formatDay(end)}` : ""}` : "No dates yet"}</p>
                  <p className="num mt-4 text-4xl font-medium">{formatMoney(spent, currency, { whole: true })}</p>
                  <p className="mt-1 text-sm text-muted">
                    {days ? `${formatMoney(spent / days, currency, { whole: true })}/day · ${days} days` : `${s?.count ?? 0} expenses`}
                  </p>
                  {ratio != null ? (
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className={`h-full rounded-full ${ratio > 1 ? "bg-bad" : ratio > 0.8 ? "bg-warn" : "bg-accent"}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                    </div>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No trips yet" body="Create a trip to keep its spending separate from your monthly budget, or count it as one lump sum." action={<NewTripButton />} />
      )}
    </>
  );
}
