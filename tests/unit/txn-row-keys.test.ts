import { describe, expect, it } from "vitest";
import { rowKeys } from "@/components/transactions/txn-list";
import type { LedgerRow } from "@/lib/data/types";

const row = (txn_id: string | null, entry_date: string, extra: Partial<LedgerRow> = {}) =>
  ({ txn_id, trip_id: null, installment_seq: null, entry_date, ...extra }) as LedgerRow;

describe("rowKeys", () => {
  it("keys a row the same wherever it sits in the list", () => {
    const a = row("a", "2026-09-01");
    const b = row("b", "2026-09-02");
    expect(rowKeys([a, b])).toEqual(rowKeys([b, a]).reverse());
    // deleting the first row leaves the second row's key unchanged
    expect(rowKeys([b])[0]).toBe(rowKeys([a, b])[1]);
  });

  it("tells installments of one transaction apart", () => {
    const keys = rowKeys([row("p", "2026-09-01", { installment_seq: 1 }), row("p", "2026-10-01", { installment_seq: 2 })]);
    expect(new Set(keys).size).toBe(2);
  });

  it("keeps exact duplicates unique", () => {
    const keys = rowKeys([row(null, "2026-09-01", { trip_id: "t" }), row(null, "2026-09-01", { trip_id: "t" })]);
    expect(keys).toEqual(["t-0-2026-09-01", "t-0-2026-09-01~1"]);
  });
});
