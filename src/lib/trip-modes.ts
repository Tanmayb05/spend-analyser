import type { TripMode } from "@/lib/data/types";

export const MODE_COPY: Record<TripMode, { title: string; body: string }> = {
  excluded: { title: "Not counted", body: "Trip spending stays separate. Your monthly numbers ignore it." },
  lump_sum: { title: "One lump sum", body: "The trip total counts as one expense, optionally spread over months." },
  itemized: { title: "Each expense", body: "Every trip expense counts in its own category and month." },
};
