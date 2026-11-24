import type { LedgerRow } from "@/lib/data/types";

/** Key for an entry's colour group: its subcategory, else its category. The same keys the trip breakdown (`TripStat.bySub`) uses. */
export const tintKey = (r: Pick<LedgerRow, "subcategory_id" | "category_id">): string => r.subcategory_id ?? `cat:${r.category_id}`;
