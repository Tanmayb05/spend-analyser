import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { sparkPath, sparkPoints, type TagDirection } from "@/lib/analytics/price-tag";
import { cn } from "@/lib/utils";

/** The corner cut off the top right. The inner layer is 1px in, so its diagonal moves by 1px / cos(45deg) less to keep the hairline even. */
const CUT = 18;
const CUT_INNER = CUT - 0.59;
const RADIUS = "var(--radius-inset)";
const outerShape = `polygon(0 0, calc(100% - ${CUT}px) 0, 100% ${CUT}px, 100% 100%, 0 100%)`;
const innerShape = `polygon(0 0, calc(100% - ${CUT_INNER}px) 0, 100% ${CUT_INNER}px, 100% 100%, 0 100%)`;

const SW = 64;
const SH = 24;

export type PriceTagProps = {
  name: string;
  /** Formatted current unit price. */
  price: string;
  direction: TagDirection | null;
  /** "12%" style, no sign. */
  changeText: string | null;
  /** "vs $4.50 last time" */
  vsText: string | null;
  history: number[];
  /** "Aldi · 3 May" */
  footer: string;
  className?: string;
  children?: ReactNode;
};

const TONE: Record<TagDirection, string> = { up: "text-warn", down: "text-good", flat: "text-muted" };

/**
 * A shelf label: paper surface, hairline border, a punched hole top left and one cut corner top right.
 * The border is a 1px layer behind the surface because clip-path would otherwise cut it off on the diagonal.
 */
export function PriceTag({ name, price, direction, changeText, vsText, history, footer, className }: PriceTagProps) {
  const pts = sparkPoints(history, SW, SH);
  const last = pts.at(-1);
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;
  const dirWord = direction === "up" ? "up" : direction === "down" ? "down" : "unchanged";
  return (
    <div className={cn("relative", className)}>
      <span aria-hidden className="absolute inset-0 bg-border" style={{ clipPath: outerShape, borderRadius: RADIUS }} />
      <span aria-hidden className="absolute inset-px bg-surface-2" style={{ clipPath: innerShape, borderRadius: `calc(${RADIUS} - 1px)` }} />
      <span aria-hidden className="absolute left-3 top-3 size-2.5 rounded-full border border-border bg-bg" />
      <div className="relative px-compact pb-3 pt-3">
        <p className="truncate pl-5 pr-4 text-sm font-medium">{name}</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="num-lg text-2xl font-medium leading-none">{price}</p>
          {pts.length ? (
            <svg viewBox={`0 0 ${SW} ${SH}`} width={SW} height={SH} role="img" aria-label="Price history" className="shrink-0 overflow-visible">
              <path d={sparkPath(pts)} fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: "var(--accent)" }} />
              {last ? <circle cx={last.x} cy={last.y} r={2.5} style={{ fill: "var(--accent)" }} /> : null}
            </svg>
          ) : null}
        </div>
        <p className="mt-2 flex min-h-5 items-center gap-1 text-xs">
          {direction ? (
            <>
              <span className={cn("inline-flex items-center gap-0.5 font-medium", TONE[direction])}>
                <Icon size={14} aria-hidden />
                <span className="num">{direction === "flat" ? "Unchanged" : changeText}</span>
                <span className="sr-only"> {dirWord} vs last purchase</span>
              </span>
              {vsText ? <span className="truncate text-faint">{vsText}</span> : null}
            </>
          ) : (
            <span className="text-faint">First purchase</span>
          )}
        </p>
        <p className="mt-2 truncate border-t border-dashed border-border pt-2 text-xs text-muted">{footer}</p>
      </div>
    </div>
  );
}
