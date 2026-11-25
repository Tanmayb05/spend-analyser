"use client";

import NumberFlow from "@number-flow/react";
import { formatMoney } from "@/lib/money";
import { DUR, EASE_UI } from "@/lib/motion";
import { cn } from "@/lib/utils";

const EASE = `cubic-bezier(${EASE_UI.join(",")})`;
const MOVE = { duration: DUR.slow * 1000, easing: EASE };
const FADE = { duration: DUR.fast * 1000, easing: "ease-out" };

/**
 * A display money figure that rolls its digits when the value changes (month switch, filter, hover).
 * Formats like `formatMoney` (same locale rule, same "−" minus) and inherits the parent's type styles
 * (`num-lg`, `money`, size, tone). NumberFlow skips the animation under prefers-reduced-motion and renders
 * the plain figure on the server, so first paint matches the old static text.
 * For display figures only; table rows stay static text.
 */
export function MoneyFlow({
  value,
  currency = "USD",
  whole = false,
  signed = false,
  locale,
  className,
}: {
  value: number;
  currency?: string;
  /** drop cents */
  whole?: boolean;
  /** always show + / − */
  signed?: boolean;
  locale?: string;
  className?: string;
}) {
  // the sign is drawn as a prefix so it matches formatMoney's typographic minus (Intl gives a hyphen)
  const sign = value < 0 ? "−" : signed && value > 0 ? "+" : "";
  return (
    <NumberFlow
      value={Math.abs(value)}
      prefix={sign || undefined}
      locales={locale ?? (currency === "INR" ? "en-IN" : "en-US")}
      format={{
        style: "currency",
        currency,
        maximumFractionDigits: whole ? 0 : 2,
        minimumFractionDigits: whole ? 0 : 2,
      }}
      transformTiming={MOVE}
      spinTiming={MOVE}
      opacityTiming={FADE}
      // NumberFlow names itself through ElementInternals; the explicit label is the same text and
      // also reaches tools that only read attributes
      role="img"
      aria-label={formatMoney(value, currency, { whole, signed, locale })}
      className={cn("max-w-full", className)}
    />
  );
}
