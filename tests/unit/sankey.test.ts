import { describe, expect, it } from "vitest";
import { buildCashFlow, describe as describeFocus, layoutSankey, pathOf, ribbonPath, suggestHeight, type SankeyGraph } from "@/lib/analytics/sankey";
import { row } from "./fixtures";

const TODAY = "2026-11-24";
const MONTH = "2026-11-01";
const info = (id: string) => ({ label: id[0].toUpperCase() + id.slice(1), color: `var(--c-${id})` });
const fmt = (n: number) => `$${n}`;
const base = { categoryInfo: info, format: fmt };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const inflow = (g: SankeyGraph, id: string) => sum(g.links.filter((l) => l.target === id).map((l) => l.value));
const outflow = (g: SankeyGraph, id: string) => sum(g.links.filter((l) => l.source === id).map((l) => l.value));

const rows = [
  row({ entry_date: "2026-11-02", amount: 1000, type: "income", category_id: "salary" }),
  row({ entry_date: "2026-11-03", amount: 200, category_id: "groceries", merchant_id: "m1", merchant_name: "Corner Mart" }),
  row({ entry_date: "2026-11-04", amount: 100, category_id: "groceries", merchant_id: "m2", merchant_name: "Big Basket" }),
  row({ entry_date: "2026-11-05", amount: 20, category_id: "groceries", merchant_id: "m3", merchant_name: "Stall" }),
  row({ entry_date: "2026-11-06", amount: 15, category_id: "groceries" }),
  row({ entry_date: "2026-11-07", amount: 150, category_id: "rent" }),
  row({ entry_date: "2026-11-08", amount: 50, category_id: "fun", merchant_id: "m4", merchant_name: "Cinema" }),
];

describe("buildCashFlow", () => {
  const g = buildCashFlow(rows, MONTH, TODAY, base);

  it("totals income, spend and what is saved", () => {
    expect(g.income).toBe(1000);
    expect(g.spent).toBe(535);
    expect(g.saved).toBe(465);
    expect(g.shortfall).toBe(0);
    expect(g.nodes.find((n) => n.id === "saved")?.value).toBe(465);
  });

  it("conserves flow at every node", () => {
    for (const n of g.nodes) {
      if (n.column === 0) expect(outflow(g, n.id)).toBeCloseTo(n.value, 2);
      if (n.column === 1 && n.kind === "category" && outflow(g, n.id) > 0) expect(outflow(g, n.id)).toBeCloseTo(inflow(g, n.id), 2);
      if (n.column > 0) expect(inflow(g, n.id)).toBeCloseTo(n.value, 2);
    }
    expect(outflow(g, "income")).toBeCloseTo(g.income, 2);
  });

  it("caps merchants per category and folds the rest into one Other", () => {
    const groceries = g.nodes.filter((n) => n.id.startsWith("m:groceries:"));
    expect(groceries.map((n) => n.label)).toEqual(["Corner Mart", "Big Basket", "Other · Groceries"]);
    expect(groceries.find((n) => n.kind === "other")?.value).toBe(35);
  });

  it("makes a category without merchants a sink, and names a lone leftover merchant", () => {
    expect(g.nodes.some((n) => n.id.startsWith("m:rent:"))).toBe(false);
    expect(outflow(g, "cat:rent")).toBe(0);
    expect(g.nodes.find((n) => n.id === "m:fun:m4")?.label).toBe("Cinema");
  });

  it("adds a Beyond income source when spending beats income", () => {
    const over = buildCashFlow([row({ entry_date: "2026-11-02", amount: 100, type: "income" }), ...rows.slice(1)], MONTH, TODAY, base);
    expect(over.saved).toBe(0);
    expect(over.shortfall).toBe(435);
    expect(over.nodes.some((n) => n.id === "saved")).toBe(false);
    expect(outflow(over, "income") + outflow(over, "gap")).toBeCloseTo(over.spent, 2);
    expect(inflow(over, "cat:groceries")).toBeCloseTo(335, 1);
  });

  it("works with no income at all, and is empty with no spending", () => {
    const noIncome = buildCashFlow(rows.slice(1), MONTH, TODAY, base);
    expect(noIncome.nodes.some((n) => n.id === "income")).toBe(false);
    expect(outflow(noIncome, "gap")).toBeCloseTo(535, 2);
    expect(buildCashFlow([], MONTH, TODAY, base).nodes).toEqual([]);
  });

  it("folds categories past the cap into Other categories, and ignores scheduled rows", () => {
    const many = ["a", "b", "c", "d"].map((c, i) => row({ entry_date: "2026-11-03", amount: 100 - i * 10, category_id: c }));
    const capped = buildCashFlow(many, MONTH, TODAY, { ...base, categories: 2 });
    expect(capped.nodes.filter((n) => n.kind === "category").map((n) => n.label)).toEqual(["A", "B", "Other categories"]);
    expect(capped.spent).toBe(340);
    const sched = buildCashFlow([...many, row({ entry_date: "2026-11-30", amount: 999, category_id: "a", is_scheduled: true })], MONTH, TODAY, base);
    expect(sched.spent).toBe(340);
  });

  it("nets refunds against a category and keeps the total consistent", () => {
    const r = buildCashFlow([row({ entry_date: "2026-11-03", amount: 100, category_id: "a", merchant_id: "x", merchant_name: "X" }), row({ entry_date: "2026-11-04", amount: 30, type: "refund", category_id: "a", merchant_id: "x", merchant_name: "X" })], MONTH, TODAY, base);
    expect(r.spent).toBe(70);
    expect(r.nodes.find((n) => n.id === "m:a:x")?.value).toBe(70);
  });
});

describe("layoutSankey", () => {
  const g = buildCashFlow(rows, MONTH, TODAY, base);
  const L = layoutSankey(g, { width: 800, height: 400, padLeft: 80, padRight: 160 });

  it("keeps every node inside the box and never overlaps within a column", () => {
    for (const n of L.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + n.h).toBeLessThanOrEqual(400 + 1e-6);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w).toBeLessThanOrEqual(800 + 1e-6);
    }
    for (const c of [0, 1, 2]) {
      const col = L.nodes.filter((n) => n.column === c).sort((a, b) => a.y - b.y);
      for (let i = 1; i < col.length; i += 1) expect(col[i].y).toBeGreaterThanOrEqual(col[i - 1].y + col[i - 1].h + 9.99);
    }
  });

  it("uses one scale: equal amounts get equal ribbon thickness", () => {
    const a = L.links.find((l) => l.id === "cat:groceries>m:groceries:m1")!;
    const b = L.links.find((l) => l.id === "income>cat:groceries")!;
    expect(b.w / b.value).toBeCloseTo(a.w / a.value, 6);
  });

  it("starts ribbons on the source's right edge and ends them on the target's left edge, inside the node", () => {
    const byId = new Map(L.nodes.map((n) => [n.id, n]));
    for (const l of L.links) {
      const s = byId.get(l.source)!;
      const t = byId.get(l.target)!;
      expect(l.x0).toBeCloseTo(s.x + s.w, 6);
      expect(l.x1).toBeCloseTo(t.x, 6);
      expect(l.y0).toBeGreaterThanOrEqual(s.y - 1e-6);
      expect(l.y0 + l.w).toBeLessThanOrEqual(s.y + s.h + 1e-6);
      expect(l.y1).toBeGreaterThanOrEqual(t.y - 1e-6);
      expect(l.y1 + l.w).toBeLessThanOrEqual(t.y + t.h + 1e-6);
      expect(l.d.startsWith("M")).toBe(true);
      expect(l.d.endsWith("Z")).toBe(true);
    }
  });

  it("lifts tiny nodes to the minimum height and handles an empty graph", () => {
    expect(Math.min(...L.nodes.map((n) => n.h))).toBeGreaterThanOrEqual(6);
    expect(layoutSankey({ nodes: [], links: [], income: 0, spent: 0, saved: 0, shortfall: 0 }, { width: 100, height: 100 }).nodes).toEqual([]);
  });

  it("suggests more height for more nodes, within bounds", () => {
    expect(suggestHeight(g)).toBeGreaterThanOrEqual(260);
    expect(suggestHeight(g, 100, 120)).toBeLessThanOrEqual(120);
  });
});

describe("ribbonPath", () => {
  it("is two cubic curves joined by vertical edges", () => {
    expect(ribbonPath(0, 10, 100, 40, 8)).toBe("M0,10C50,10 50,40 100,40L100,48C50,48 50,18 0,18Z");
  });
});

describe("pathOf and describe", () => {
  const g = buildCashFlow(rows, MONTH, TODAY, base);

  it("a merchant lights its category link, category, income and nothing from siblings", () => {
    const p = pathOf(g, { kind: "node", id: "m:groceries:m1" });
    expect([...p.nodes].sort()).toEqual(["cat:groceries", "income", "m:groceries:m1"]);
    expect([...p.links].sort()).toEqual(["cat:groceries>m:groceries:m1", "income>cat:groceries"]);
  });

  it("a category lights its upstream and all merchants downstream", () => {
    const p = pathOf(g, { kind: "node", id: "cat:groceries" });
    expect(p.links.has("income>cat:groceries")).toBe(true);
    expect(p.links.has("cat:groceries>m:groceries:other")).toBe(true);
    expect(p.links.has("income>cat:rent")).toBe(false);
  });

  it("a link lights itself plus the chain on both sides", () => {
    const p = pathOf(g, { kind: "link", id: "income>cat:groceries" });
    expect(p.nodes.has("income")).toBe(true);
    expect(p.links.has("cat:groceries>m:groceries:m2")).toBe(true);
  });

  it("returns nothing without focus and describes flows", () => {
    expect(pathOf(g, null).nodes.size).toBe(0);
    expect(describeFocus(g, { kind: "link", id: "income>saved" })).toBe("Income to Saved: $465 (47%)");
    expect(describeFocus(g, { kind: "node", id: "cat:rent" })).toBe("Rent: $150");
  });
});
