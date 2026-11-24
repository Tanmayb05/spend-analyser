import { SpinLink } from "@/components/trips/spin-link";
import { fitFontSize, shortenLabel, stampColorIndex, stampDate, stampRotation } from "@/lib/trip-stamp";
import { formatMoney } from "@/lib/money";

type Props = {
  id: string;
  name: string;
  currency: string;
  spent: number;
  /** ISO end date; the stamp shows its month and year */
  end: string;
  days: number | null;
  /** Resolved cover image (hotlinked stock photo or signed URL). When set the stamp is cut from the photo, like the trip card. */
  coverSrc?: string | null;
};

/**
 * A finished trip as a passport stamp drawn in code: double hairline ring, trip name along the top arc, month and total in the centre.
 * Drag it up or down and it spins like a fridge magnet (see SpinLink). Tilt and ink come from the trip id, so a stamp looks the same on every render. Ink is a chart token mixed into the text colour.
 * With a cover photo the stamp is cut from the photo under the trip card's flat scrim, with white ink.
 */
export function TripStamp({ id, name, currency, spent, end, days, coverSrc }: Props) {
  const photo = Boolean(coverSrc);
  const whole = formatMoney(spent, currency, { whole: true });
  const total = whole.length > 9 ? formatMoney(spent, currency, { compact: true }) : whole;
  const date = stampDate(end);
  const label = shortenLabel(name, 20);
  const ink = `color-mix(in srgb, var(--c${stampColorIndex(id)}) 55%, var(--text))`;
  const rotation = stampRotation(id);
  const bottom = days ? `${days} ${days === 1 ? "day" : "days"}` : "Visited";
  const pathTop = `stamp-top-${id}`;
  const pathBottom = `stamp-bottom-${id}`;
  return (
    <SpinLink href={`/trips/${id}`} tilt={rotation} title={name} label={`${name}, ended ${date}, ${whole} spent`}>
      <div className="relative block aspect-square w-full">
        {photo ? (
          <span aria-hidden className="absolute inset-0 overflow-hidden rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked stock photo / signed URL; the stamp has a fixed shape */}
            <img src={coverSrc!} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 bg-scrim" />
          </span>
        ) : null}
        <svg aria-hidden viewBox="0 0 200 200" className={photo ? "on-photo-text relative block h-full w-full text-on-photo" : "relative block h-full w-full"} style={photo ? undefined : { color: ink }}>
        <defs>
          <path id={pathTop} d="M 34 100 A 66 66 0 0 1 166 100" />
          <path id={pathBottom} d="M 20 100 A 80 80 0 0 0 180 100" />
        </defs>
        <circle cx="100" cy="100" r="96" fill={photo ? "none" : "currentColor"} fillOpacity="0.06" stroke="currentColor" strokeWidth="2" />
        <circle cx="100" cy="100" r="89" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="100" cy="100" r="54" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="26" cy="100" r="2.5" fill="currentColor" />
        <circle cx="174" cy="100" r="2.5" fill="currentColor" />
        <text fill="currentColor" fontSize="15" fontWeight="500" textAnchor="middle">
          <textPath href={`#${pathTop}`} startOffset="50%">{label}</textPath>
        </text>
        <text fill="currentColor" fontSize="13" textAnchor="middle" opacity="0.85">
          <textPath href={`#${pathBottom}`} startOffset="50%">{bottom}</textPath>
        </text>
        <text x="100" y="92" fill="currentColor" fontSize="14" fontWeight="500" textAnchor="middle">{date}</text>
        <line x1="72" y1="100" x2="128" y2="100" stroke="currentColor" strokeWidth="1" opacity="0.6" />
        <text x="100" y="124" fill="currentColor" fontSize={fitFontSize(total, 24, 90)} fontWeight="500" textAnchor="middle" className="num-lg">{total}</text>
        </svg>
      </div>
    </SpinLink>
  );
}
