import Link from "next/link";
import { formatMoney, formatPercent } from "@/lib/money";

export type BreakdownItem = { label: string; value: number; color: string; href: string };

/** Ranked horizontal bars with amount and share; each row drills into the matching filter. */
export function Breakdown({ items, total, currency }: { items: BreakdownItem[]; total: number; currency: string }) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <Link href={i.href} scroll={false} className="block">
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate">{i.label}</span>
              <span className="num shrink-0 text-muted">
                <span className="text-text">{formatMoney(i.value, currency, { whole: true })}</span> · {formatPercent(total ? i.value / total : 0)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: i.color }} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
