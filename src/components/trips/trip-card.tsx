import Link from "next/link";
import { CalendarDays, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MODE_COPY } from "@/lib/trip-modes";
import { formatDay } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
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

/** Half-circle cut into the card edge at the tear line. Painted in the page colour, clipped to the inside half. */
function Notch({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={`absolute top-0 size-5 -translate-y-1/2 rounded-full border border-border bg-bg ${side === "left" ? "-left-[11px] [clip-path:inset(0_0_0_50%)]" : "-right-[11px] [clip-path:inset(0_50%_0_0)]"}`}
    />
  );
}

export function TripCard({ trip: t, currency, spent, count, days, start, end, coverSrc }: Props) {
  const budget = t.budget ? Number(t.budget) : null;
  const ratio = budget ? spent / budget : null;
  const photo = Boolean(coverSrc);
  const range = start ? `${formatDay(start)}${end && end !== start ? ` – ${formatDay(end)}` : ""}` : "No dates yet";
  const mode = MODE_COPY[t.include_mode].title;
  const faint = photo ? "text-on-photo-muted" : "text-muted";

  // Fixed heights: every pass is the same size whatever the trip has (photo, people, budget).
  return (
    <div className="group relative isolate flex flex-col rounded-card border border-border bg-surface has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-2 has-[[data-card-link]:focus-visible]:outline-accent">
      {/* top half: the destination. The photo sits behind (-z-10 inside this isolated card) so the text stays above it */}
      <div className={`flex h-48 flex-col rounded-t-card ${photo ? "on-photo-text text-on-photo" : "bg-surface-2"}`}>
        {photo ? (
          <div className="absolute inset-x-0 top-0 -z-10 h-48 overflow-hidden rounded-t-card" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked stock photo / signed URL; sizes are fixed by the card */}
            <img src={coverSrc!} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-scrim" />
          </div>
        ) : null}
        <div className={`flex min-h-0 flex-1 flex-col p-card ${photo ? "pb-1" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 truncate text-lg font-medium">
              {/* stretched link: the ::after covers the whole pass, credit links sit above it */}
              <Link href={`/trips/${t.id}`} data-card-link data-nav-item className="after:absolute after:inset-0 after:rounded-card after:content-['']">{t.name}</Link>
            </p>
            {photo ? (
              <span className="inline-flex shrink-0 items-center rounded-full bg-on-photo-chip px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-white/25">{mode}</span>
            ) : (
              <Badge tone="neutral" className="shrink-0 bg-surface-3">{mode}</Badge>
            )}
          </div>
          <div className="mt-4 space-y-2.5 text-sm font-medium">
            <p className="flex items-center gap-2">
              <CalendarDays size={16} className={`shrink-0 ${faint}`} aria-hidden />
              <span className="min-w-0 truncate"><span className="sr-only">Dates </span>{range}{days ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}</span>
            </p>
            <p className="flex items-center gap-2">
              <Users size={16} className={`shrink-0 ${faint}`} aria-hidden />
              <span className={`min-w-0 truncate ${t.companions ? "" : `${faint} font-normal`}`}><span className="sr-only">With </span>{t.companions || "No people added"}</span>
            </p>
          </div>
        </div>
        {photo && t.cover_credit_name && t.cover_credit_url ? (
          <p className="on-photo-text relative z-10 shrink-0 truncate px-card pb-2 text-xs font-medium text-on-photo-muted">
            Photo by{" "}
            <a href={t.cover_credit_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t.cover_credit_name}</a>
            {" on "}
            <a href="https://unsplash.com/?utm_source=spend_analyser&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Unsplash</a>
          </p>
        ) : null}
      </div>

      {/* tear line */}
      <div className="relative" aria-hidden>
        <Notch side="left" />
        <Notch side="right" />
        <div className="mx-6 border-t border-dashed border-border" />
      </div>

      {/* bottom half: the stub, on the plain surface so figures stay easy to read */}
      <div className="rounded-b-card p-card pt-4 transition-colors duration-(--dur-fast) group-hover:bg-surface-2">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-label text-muted"><Wallet size={16} aria-hidden />Spent</p>
            <p className="num-lg text-3xl font-medium">{formatMoney(spent, currency, { whole: true })}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-label text-muted">{days ? "Per day" : "Expenses"}</p>
            <p className="money text-sm font-medium">{days ? formatMoney(spent / days, currency, { whole: true }) : count}</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-inset bg-surface-3" aria-hidden>
          {ratio != null ? <div className={`h-full rounded-inset ${ratio > 1 ? "bg-bad" : "bg-accent"}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} /> : null}
        </div>
        <p className="mt-2 text-xs text-muted">{budget ? `${formatPercent(ratio!)} of ${formatMoney(budget, currency, { whole: true })} budget` : "No budget set"}</p>
      </div>
    </div>
  );
}
