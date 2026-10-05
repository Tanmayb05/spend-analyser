export const POPULAR_CURRENCIES = ["USD", "INR", "EUR", "GBP", "CAD", "AUD", "SGD", "AED", "JPY", "CNY", "CHF"] as const;

import { CURRENCIES, CURRENCY_CODES } from "./currencies";

/** ISO 4217 currencies, popular ones first (static, identical on server and client). */
export function allCurrencies(): string[] {
  return CURRENCY_CODES;
}

export function currencyName(code: string): string {
  return CURRENCIES.find(([c]) => c === code)?.[1] ?? code;
}

const cache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions) {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

export type MoneyOptions = {
  locale?: string;
  /** drop cents for large round display */
  whole?: boolean;
  /** 12.3K / 1.2L style */
  compact?: boolean;
  /** always show + / − */
  signed?: boolean;
};

export function formatMoney(amount: number, currency = "USD", opts: MoneyOptions = {}): string {
  const locale = opts.locale ?? (currency === "INR" ? "en-IN" : "en-US");
  const f = nf(locale, {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : opts.whole ? 0 : 2,
    minimumFractionDigits: opts.compact || opts.whole ? 0 : 2,
    signDisplay: opts.signed ? "exceptZero" : "auto",
  });
  return f.format(amount).replace("-", "−");
}

export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return "–";
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Relative change; null when the base is zero. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}
