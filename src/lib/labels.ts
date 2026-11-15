import type { Scope } from "@/lib/analytics/summary";

/** User-facing names for the spending-scope filter. The URL values (all | core) never change. */
export const SCOPE_LABEL: Record<Scope, string> = {
  all: "All spending",
  core: "Everyday",
};
