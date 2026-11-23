import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODE_COPY } from "@/lib/trip-modes";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Trip } from "@/lib/data/types";

type Props = {
  trip: Trip;
  currency: string;
  spent: number;
  count: number;
  days: number | null;
  start: string | null;
  end: string | null;
  /** Resolved image URL: the hotlinked stock photo or a signed URL for an upload. */
  coverSrc: string | null;
};

export function TripCard({ trip: t, currency, spent, count, days, start, end, coverSrc }: Props) {
  const ratio = t.budget ? spent / Number(t.budget) : null;
  const photo = Boolean(coverSrc);
  const dates = start ? `${formatDay(start)}${end && end !== start ? ` – ${formatDay(end)}` : ""}` : "No dates yet";

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-lg font-medium">{t.name}</p>
        {photo ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-on-photo-chip px-2 py-0.5 text-xs font-medium">{MODE_COPY[t.include_mode].title}</span>
        ) : (
          <Badge tone="neutral" className="shrink-0">{MODE_COPY[t.include_mode].title}</Badge>
        )}
      </div>
      <p className={photo ? "mt-1 text-sm text-on-photo-muted" : "mt-1 text-sm text-muted"}>{dates}</p>
      <p className="num-lg mt-5 text-3xl font-medium">{formatMoney(spent, currency, { whole: true })}</p>
      <p className={photo ? "mt-1 text-sm text-on-photo-muted" : "mt-1 text-sm text-muted"}>
        {days ? <><span className="money">{formatMoney(spent / days, currency, { whole: true })}</span>/day · {days} days</> : `${count} expenses`}
      </p>
      {ratio != null ? (
        <div className={`mt-3 h-1.5 overflow-hidden rounded-inset ${photo ? "bg-on-photo-track" : "bg-surface-3"}`}>
          <div className={`h-full rounded-inset ${ratio > 1 ? "bg-bad" : photo ? "bg-on-photo" : "bg-accent"}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
      ) : null}
    </>
  );

  if (!photo) {
    return (
      <Link href={`/trips/${t.id}`}>
        <Card className="h-full transition-colors duration-(--dur-fast) hover:bg-surface-2">{body}</Card>
      </Link>
    );
  }

  // The credit link sits outside the card link (no nested anchors) but is laid over the card's bottom edge.
  return (
    <div className="relative min-h-52 overflow-hidden rounded-card border border-border bg-surface-3 text-on-photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked stock photo / signed URL; sizes are fixed by the card */}
      <img src={coverSrc!} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-scrim" aria-hidden />
      <Link href={`/trips/${t.id}`} className="relative flex h-full min-h-52 flex-col p-card pb-9">
        {body}
      </Link>
      {t.cover_credit_name && t.cover_credit_url ? (
        <p className="absolute inset-x-card bottom-2 truncate text-xs text-on-photo-muted">
          Photo by{" "}
          <a href={t.cover_credit_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t.cover_credit_name}</a>
          {" on "}
          <a href="https://unsplash.com/?utm_source=spend_analyser&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Unsplash</a>
        </p>
      ) : null}
    </div>
  );
}
