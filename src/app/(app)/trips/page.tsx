import { TripCard } from "@/components/trips/trip-card";
import { TripStamp } from "@/components/trips/trip-stamp";
import { isTripEnded } from "@/lib/trip-stamp";
import { requireUser } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty";
import { NewTripButton } from "@/components/trips/trip-actions";
import { getReferenceData } from "@/lib/data/reference";
import { getTripStats, tripDays } from "@/lib/data/trips";
import { formatMoney } from "@/lib/money";
import { InfoTitle } from "@/components/ui/info-title";
import { HELP } from "@/lib/help";

export const metadata = { title: "Trips" };

export default async function TripsPage() {
  const ref = await getReferenceData();
  const stats = await getTripStats();
  const currency = ref.profile.base_currency;
  const trips = [...ref.trips].sort((a, b) => (stats.get(b.id)?.last ?? b.start_date ?? "").localeCompare(stats.get(a.id)?.last ?? a.start_date ?? ""));
  // a trip becomes a stamp once its own end date has passed; the rest stay boarding passes
  const visited = trips.filter((t) => isTripEnded(t.end_date, ref.today)).sort((a, b) => b.end_date!.localeCompare(a.end_date!));
  const passes = trips.filter((t) => !isTripEnded(t.end_date, ref.today));
  const uploads = trips.flatMap((t) => (t.cover_path ? [t.cover_path] : []));
  const signed = new Map<string, string>();
  if (uploads.length) {
    const { supabase } = await requireUser();
    const { data } = await supabase.storage.from("trip-covers").createSignedUrls(uploads, 60 * 60);
    for (const r of data ?? []) if (r.path && r.signedUrl) signed.set(r.path, r.signedUrl);
  }
  const total = [...stats.values()].reduce((a, s) => a + s.total, 0);
  const excluded = ref.trips.filter((t) => t.include_mode === "excluded").reduce((a, t) => a + (stats.get(t.id)?.total ?? 0), 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <InfoTitle as="h1" info={HELP.trips} className="text-2xl font-medium" panelClassName="max-w-xl">Trips</InfoTitle>
          <p className="mt-1 text-sm text-muted">
            {formatMoney(total, currency, { whole: true })} across {trips.length} trips · {formatMoney(excluded, currency, { whole: true })} kept out of monthly spending
          </p>
        </div>
        <NewTripButton />
      </div>
      {trips.length ? (
        <>
          {passes.length ? (
            <section aria-labelledby={visited.length ? "trips-upcoming" : undefined}>
              {visited.length ? <h2 id="trips-upcoming" className="mb-3 text-lg font-medium">Upcoming and active</h2> : null}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {passes.map((t) => {
                  const s = stats.get(t.id);
                  const start = t.start_date ?? s?.first ?? null;
                  const end = t.end_date ?? s?.last ?? null;
                  return (
                    <TripCard
                      key={t.id}
                      trip={t}
                      currency={currency}
                      spent={s?.total ?? 0}
                      count={s?.count ?? 0}
                      days={tripDays(start, end)}
                      start={start}
                      end={end}
                      coverSrc={t.cover_path ? (signed.get(t.cover_path) ?? null) : t.cover_url}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}
          {visited.length ? (
            <section aria-labelledby="trips-visited" className={passes.length ? "mt-8" : undefined}>
              <h2 id="trips-visited" className="mb-3 text-lg font-medium">Visited</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                {visited.map((t) => {
                  const s = stats.get(t.id);
                  return <TripStamp key={t.id} id={t.id} name={t.name} currency={currency} spent={s?.total ?? 0} end={t.end_date!} days={tripDays(t.start_date ?? s?.first ?? null, t.end_date)} coverSrc={t.cover_path ? (signed.get(t.cover_path) ?? null) : t.cover_url} />;
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <EmptyState title="No trips yet" body="Create a trip to keep its spending separate from your monthly budget, or count it as one lump sum." action={<NewTripButton />} />
      )}
    </>
  );
}
