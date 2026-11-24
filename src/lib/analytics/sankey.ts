import type { LedgerRow } from "@/lib/data/types";
import { monthStart, type ISODate } from "@/lib/dates";
import { round2 } from "@/lib/utils";
import { byCategory, countable, topWithOther } from "./summary";

// ---- Graph: income -> categories -> merchants ---------------------------------------------

export type SankeyKind = "income" | "gap" | "category" | "saved" | "merchant" | "other";

export type SankeyNode = {
  id: string;
  label: string;
  /** 0 = where money came from, 1 = categories (and saved), 2 = merchants */
  column: 0 | 1 | 2;
  kind: SankeyKind;
  /** a CSS colour value (token reference) */
  color: string;
  value: number;
  /** preformatted amount, so client code never formats money */
  valueText: string;
};

export type SankeyLink = {
  id: string;
  source: string;
  target: string;
  value: number;
  color: string;
  valueText: string;
  /** preformatted "share of all money flowing" */
  shareText: string;
};

export type SankeyGraph = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  income: number;
  spent: number;
  /** income - spend when positive, else 0 */
  saved: number;
  /** spend beyond income, else 0 */
  shortfall: number;
};

export type SankeyOptions = {
  /** categories shown before the rest fold into one "Other categories" node */
  categories?: number;
  /** merchants shown per category before the rest fold into "Other" */
  merchantsPerCategory?: number;
  categoryInfo: (id: string) => { label: string; color: string };
  format?: (n: number) => string;
  formatShare?: (ratio: number) => string;
};

const INCOME_COLOR = "var(--chart-n1)";
const GAP_COLOR = "var(--chart-n2)";
const OTHER_COLOR = "var(--chart-muted)";
const SAVED_COLOR = "var(--good)";

/**
 * Where one month's income went. Income (and, when spending beat income, "Beyond income") flows into the biggest categories,
 * unspent income flows into "Saved", and each category flows into its top merchants with the rest folded into one "Other" per category.
 * Flows are conserved: every node's inflow equals its outflow, except the final column and "Saved".
 * Uses the same counting rules as the summary (scheduled rows left out, refunds net, smoothed installments).
 */
export function buildCashFlow(rows: LedgerRow[], month: ISODate, today: ISODate, opts: SankeyOptions): SankeyGraph {
  const m = monthStart(month);
  const fmt = opts.format ?? ((n: number) => String(n));
  const pct = opts.formatShare ?? ((r: number) => `${Math.round(r * 100)}%`);
  const capCats = opts.categories ?? 6;
  const capMerch = opts.merchantsPerCategory ?? 2;

  const counted = countable(rows.filter((r) => r.month === m), m, today);
  const income = round2(counted.reduce((a, r) => a + Number(r.income), 0));
  const cats = topWithOther(byCategory(rows, m, today, "all"), capCats);
  const spent = round2(cats.reduce((a, c) => a + c.spent, 0));
  const empty: SankeyGraph = { nodes: [], links: [], income, spent, saved: 0, shortfall: 0 };
  if (spent <= 0) return empty;

  const saved = income > spent ? round2(income - spent) : 0;
  const shortfall = spent > income ? round2(spent - income) : 0;
  const total = Math.max(income, spent);
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];
  const share = (v: number) => pct(total > 0 ? v / total : 0);
  const node = (n: Omit<SankeyNode, "valueText">) => nodes.push({ ...n, valueText: fmt(n.value) });
  const link = (source: string, target: string, value: number, color: string) => {
    const v = round2(value);
    if (v <= 0) return;
    links.push({ id: `${source}>${target}`, source, target, value: v, color, valueText: fmt(v), shareText: share(v) });
  };

  // column 0
  const hasIncome = income > 0;
  if (hasIncome) node({ id: "income", label: "Income", column: 0, kind: "income", color: INCOME_COLOR, value: Math.min(income, total) });
  if (shortfall > 0) node({ id: "gap", label: "Beyond income", column: 0, kind: "gap", color: GAP_COLOR, value: shortfall });

  // column 1 + 2
  const incomeCovers = hasIncome ? Math.min(income, spent) : 0;
  for (const c of cats) {
    const isOther = c.categoryId === "other";
    const info = isOther ? { label: "Other categories", color: "var(--c-other)" } : opts.categoryInfo(c.categoryId);
    const id = `cat:${c.categoryId}`;
    node({ id, label: info.label, column: 1, kind: "category", color: info.color, value: c.spent });
    // proportional split of the category between income and the shortfall, so both sources reach every category
    const fromIncome = round2((c.spent * incomeCovers) / spent);
    if (hasIncome) link("income", id, fromIncome, info.color);
    if (shortfall > 0) link("gap", id, round2(c.spent - fromIncome), info.color);

    if (isOther) continue;
    for (const mer of merchantsFor(rows, m, today, c.categoryId, c.spent, capMerch, spent)) {
      const mid = `m:${c.categoryId}:${mer.key}`;
      node({ id: mid, label: mer.other ? `Other · ${info.label}` : mer.label, column: 2, kind: mer.other ? "other" : "merchant", color: mer.other ? OTHER_COLOR : info.color, value: mer.value });
      link(id, mid, mer.value, info.color);
    }
  }
  if (saved > 0) {
    node({ id: "saved", label: "Saved", column: 1, kind: "saved", color: SAVED_COLOR, value: saved });
    link("income", "saved", saved, SAVED_COLOR);
  }

  // income node = what actually leaves it
  const incomeNode = nodes.find((n) => n.id === "income");
  if (incomeNode) {
    incomeNode.value = round2(links.filter((l) => l.source === "income").reduce((a, l) => a + l.value, 0));
    incomeNode.valueText = fmt(incomeNode.value);
  }
  // categories with no merchant lines are sinks; shown value stays the category total
  return { nodes, links, income, spent, saved, shortfall };
}

type MerchantLine = { key: string; label: string; value: number; other: boolean };

/** Top merchants of a category (by net spend), then everything else (small merchants, no merchant, refunds) as one "Other". Sums to `catTotal`. */
function merchantsFor(rows: LedgerRow[], month: ISODate, today: ISODate, categoryId: string, catTotal: number, cap: number, totalSpend: number): MerchantLine[] {
  const per = new Map<string, { label: string; value: number }>();
  for (const r of countable(rows.filter((x) => x.month === month && x.category_id === categoryId && x.type !== "income" && x.merchant_id), month, today)) {
    const e = per.get(r.merchant_id) ?? { label: r.merchant_name || "Unnamed", value: 0 };
    e.value += Number(r.spend);
    per.set(r.merchant_id, e);
  }
  const ranked = [...per.entries()]
    .map(([key, e]) => ({ key, label: e.label, value: round2(e.value), other: false }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  // a merchant must also be a visible slice of all spending, or it only adds clutter
  const minShare = totalSpend * 0.02;
  const kept = ranked.filter((e, i) => i < cap && e.value >= minShare);
  if (!kept.length) return [];
  const rest = round2(catTotal - kept.reduce((a, e) => a + e.value, 0));
  const tail = ranked.filter((e) => !kept.includes(e));
  // a lone leftover merchant (and nothing else) is named rather than hidden in "Other"
  if (tail.length === 1 && Math.abs(rest - tail[0].value) < 0.005) return [...kept, tail[0]];
  return rest > 0.004 ? [...kept, { key: "other", label: "Other", value: rest, other: true }] : kept;
}

// ---- Layout -------------------------------------------------------------------------------

export type LayoutOptions = {
  width: number;
  height: number;
  nodeWidth?: number;
  gap?: number;
  minNode?: number;
  padLeft?: number;
  padRight?: number;
  padY?: number;
};

export type LaidNode = SankeyNode & { x: number; y: number; w: number; h: number };
export type LaidLink = SankeyLink & {
  /** ribbon thickness */
  w: number;
  /** left-edge top y and right-edge top y */
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  /** closed ribbon outline: two cubic beziers */
  d: string;
};
export type SankeyLayout = { nodes: LaidNode[]; links: LaidLink[]; width: number; height: number };

/** A height that gives the busiest column room for its labels (at least 28px per node). */
export function suggestHeight(graph: SankeyGraph, min = 260, max = 620): number {
  const counts = [0, 0, 0];
  for (const n of graph.nodes) counts[n.column] += 1;
  return Math.min(max, Math.max(min, Math.max(...counts) * 28));
}

/** Cubic-bezier ribbon between (x0, top0..top0+w) and (x1, top1..top1+w); control points sit halfway across, so both ends leave horizontally. */
export function ribbonPath(x0: number, top0: number, x1: number, top1: number, w: number): string {
  const xm = (x0 + x1) / 2;
  const f = (n: number) => Number(n.toFixed(2));
  return `M${f(x0)},${f(top0)}C${f(xm)},${f(top0)} ${f(xm)},${f(top1)} ${f(x1)},${f(top1)}L${f(x1)},${f(top1 + w)}C${f(xm)},${f(top1 + w)} ${f(xm)},${f(top0 + w)} ${f(x0)},${f(top0 + w)}Z`;
}

/**
 * Hand-built Sankey layout: fixed columns, nodes stacked top to bottom in the order given with a constant gap, one shared value scale
 * (so equal amounts have equal thickness everywhere), columns centred vertically, links stacked inside each node ordered by where they go.
 */
export function layoutSankey(graph: SankeyGraph, o: LayoutOptions): SankeyLayout {
  const nodeW = o.nodeWidth ?? 10;
  const gap = o.gap ?? 10;
  const minNode = o.minNode ?? 6;
  const padLeft = o.padLeft ?? 0;
  const padRight = o.padRight ?? 0;
  const padY = o.padY ?? 4;
  const { width, height } = o;
  if (!graph.nodes.length) return { nodes: [], links: [], width, height };

  const maxCol = Math.max(...graph.nodes.map((n) => n.column));
  const colX = (c: number) => padLeft + (maxCol === 0 ? 0 : (c * (width - padLeft - padRight - nodeW)) / maxCol);
  const columns = [0, 1, 2].map((c) => graph.nodes.filter((n) => n.column === c));
  const inner = height - padY * 2;

  // one scale for every column: the tightest column decides; nodes under minNode are lifted to it and take their share out of the room
  let ky = Infinity;
  for (const col of columns) {
    if (!col.length) continue;
    ky = Math.min(ky, Math.max(inner - gap * (col.length - 1), 1) / col.reduce((a, n) => a + n.value, 0));
  }
  for (let i = 0; i < 12; i += 1) {
    let next = Infinity;
    for (const col of columns) {
      if (!col.length) continue;
      const small = col.filter((n) => n.value * ky < minNode);
      const big = col.filter((n) => n.value * ky >= minNode);
      const room = Math.max(inner - gap * (col.length - 1) - small.length * minNode, 1);
      const sum = big.reduce((a, n) => a + n.value, 0);
      next = Math.min(next, sum > 0 ? room / sum : Infinity);
    }
    if (!Number.isFinite(next) || Math.abs(next - ky) < 1e-9) break;
    ky = Math.min(ky, next);
  }

  const laid = new Map<string, LaidNode>();
  columns.forEach((col, c) => {
    const heights = col.map((n) => Math.max(n.value * ky, minNode));
    const extent = heights.reduce((a, h) => a + h, 0) + gap * Math.max(col.length - 1, 0);
    let y = padY + Math.max(inner - extent, 0) / 2;
    col.forEach((n, i) => {
      laid.set(n.id, { ...n, x: colX(c), y, w: nodeW, h: heights[i] });
      y += heights[i] + gap;
    });
  });

  // stack links inside each node, ordered by the other end's position so ribbons cross as little as possible
  const center = (id: string) => {
    const n = laid.get(id)!;
    return n.y + n.h / 2;
  };
  const outOffset = new Map<string, number>();
  const inOffset = new Map<string, number>();
  const stack = (side: "source" | "target", store: Map<string, number>) => {
    const other = side === "source" ? "target" : "source";
    for (const n of laid.values()) {
      const mine = graph.links.filter((l) => l[side] === n.id).sort((a, b) => center(a[other]) - center(b[other]));
      const used = mine.reduce((a, l) => a + Math.max(l.value * ky, 1), 0);
      let y = n.y + Math.max(n.h - used, 0) / 2;
      for (const l of mine) {
        store.set(l.id, y);
        y += Math.max(l.value * ky, 1);
      }
    }
  };
  stack("source", outOffset);
  stack("target", inOffset);

  const links: LaidLink[] = graph.links.map((l) => {
    const s = laid.get(l.source)!;
    const t = laid.get(l.target)!;
    const w = Math.max(l.value * ky, 1);
    const x0 = s.x + s.w;
    const x1 = t.x;
    const y0 = outOffset.get(l.id)!;
    const y1 = inOffset.get(l.id)!;
    return { ...l, w, x0, x1, y0, y1, d: ribbonPath(x0, y0, x1, y1, w) };
  });
  return { nodes: [...laid.values()], links, width, height };
}

// ---- Highlighting -------------------------------------------------------------------------

export type Focus = { kind: "node" | "link"; id: string } | null;

/**
 * The path a node or link belongs to: everything upstream that feeds it and everything downstream it feeds
 * (for a merchant: its category link, the category, and income; for a category: income and all its merchants).
 * Sibling flows that merely share an ancestor are not part of the path.
 */
export function pathOf(graph: Pick<SankeyGraph, "links">, focus: Focus): { nodes: Set<string>; links: Set<string> } {
  const nodes = new Set<string>();
  const links = new Set<string>();
  if (!focus) return { nodes, links };
  const up = (id: string) => {
    for (const l of graph.links) {
      if (l.target === id && !links.has(l.id)) {
        links.add(l.id);
        nodes.add(l.source);
        up(l.source);
      }
    }
  };
  const down = (id: string) => {
    for (const l of graph.links) {
      if (l.source === id && !links.has(l.id)) {
        links.add(l.id);
        nodes.add(l.target);
        down(l.target);
      }
    }
  };
  if (focus.kind === "node") {
    nodes.add(focus.id);
    up(focus.id);
    down(focus.id);
  } else {
    const l = graph.links.find((x) => x.id === focus.id);
    if (!l) return { nodes, links };
    links.add(l.id);
    nodes.add(l.source);
    nodes.add(l.target);
    up(l.source);
    down(l.target);
  }
  return { nodes, links };
}

/** Plain-language description of a node or link, for the readout under the chart and for screen readers. */
export function describe(graph: SankeyGraph, focus: NonNullable<Focus>): string {
  if (focus.kind === "node") {
    const n = graph.nodes.find((x) => x.id === focus.id);
    return n ? `${n.label}: ${n.valueText}` : "";
  }
  const l = graph.links.find((x) => x.id === focus.id);
  if (!l) return "";
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? "";
  return `${label(l.source)} to ${label(l.target)}: ${l.valueText} (${l.shareText})`;
}
