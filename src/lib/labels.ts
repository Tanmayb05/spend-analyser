import type { LedgerMode } from "@/lib/data/types";
import type { Scope } from "@/lib/analytics/summary";

/** User-facing names for the two view filters. The stored/URL values (normalized | cash, all | core) never change. */
export const MODE_LABEL: Record<LedgerMode, string> = {
  normalized: "Smoothed",
  cash: "Cash flow",
};

export const MODE_HINT: Record<LedgerMode, string> = {
  normalized: "Spread large costs across months.",
  cash: "Show when money was paid.",
};

export const SCOPE_LABEL: Record<Scope, string> = {
  all: "All spending",
  core: "Everyday",
};

export const MODE_OPTIONS = (Object.keys(MODE_LABEL) as LedgerMode[]).map((value) => ({ value, label: MODE_LABEL[value] }));
