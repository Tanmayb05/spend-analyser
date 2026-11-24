import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Size of the cut corners at the top of the tag. The inner layer is 1px in, so its edge moves by 1px / cos(45°) less to keep the hairline even on the diagonals. */
const CUT = 28;
const CUT_INNER = CUT - 0.59;
const RADIUS = "var(--radius-card)";

const outerShape = `polygon(0 ${CUT}px, ${CUT}px 0, calc(100% - ${CUT}px) 0, 100% ${CUT}px, 100% 100%, 0 100%)`;
const innerShape = `polygon(0 ${CUT_INNER}px, ${CUT_INNER}px 0, calc(100% - ${CUT_INNER}px) 0, 100% ${CUT_INNER}px, 100% 100%, 0 100%)`;

/**
 * A luggage tag: surface with cut top corners and a punched hole, hung from a hairline loop.
 * The border is a 1px layer behind the surface because clip-path would otherwise cut it off on the diagonals.
 */
export function LuggageTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative pt-5", className)}>
      {/* the loop the tag hangs from; its lower half is hidden behind the tag */}
      <span aria-hidden className="absolute left-1/2 top-0 size-10 -translate-x-1/2 rounded-full border border-border" />
      <div className="relative">
        {/* the shape is two clipped layers; the content sits above them unclipped, so popovers can overflow the tag */}
        <span aria-hidden className="absolute inset-0 bg-border" style={{ clipPath: outerShape, borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS }} />
        <span aria-hidden className="absolute inset-px bg-surface" style={{ clipPath: innerShape, borderBottomLeftRadius: `calc(${RADIUS} - 1px)`, borderBottomRightRadius: `calc(${RADIUS} - 1px)` }} />
        <span aria-hidden className="absolute left-1/2 top-4 size-5 -translate-x-1/2 rounded-full border border-border bg-bg" />
        <div className="relative px-card pb-card pt-14">{children}</div>
      </div>
    </div>
  );
}
