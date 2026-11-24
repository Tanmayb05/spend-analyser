import { describe, expect, it } from "vitest";
import { punchesFor } from "@/lib/plan-punches";

const inst = (seq: number, due_date: string) => ({ seq, due_date, amount_base: 100 });

describe("punchesFor", () => {
  it("marks past installments paid, the first future one next, the rest upcoming", () => {
    const p = punchesFor([inst(1, "2026-01-05"), inst(2, "2026-02-05"), inst(3, "2026-03-05"), inst(4, "2026-04-05")], "2026-02-05");
    expect(p.map((x) => x.state)).toEqual(["paid", "paid", "next", "upcoming"]);
  });
  it("counts an installment due today as paid", () => {
    expect(punchesFor([inst(1, "2026-02-05")], "2026-02-05")[0].state).toBe("paid");
  });
  it("has no next when everything is paid", () => {
    expect(punchesFor([inst(1, "2026-01-05"), inst(2, "2026-02-05")], "2026-06-01").map((x) => x.state)).toEqual(["paid", "paid"]);
  });
  it("sorts by seq regardless of input order", () => {
    expect(punchesFor([inst(2, "2026-02-05"), inst(1, "2026-01-05")], "2026-01-10").map((x) => [x.seq, x.state])).toEqual([[1, "paid"], [2, "next"]]);
  });
});
