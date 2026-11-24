"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { describe, layoutSankey, pathOf, suggestHeight, type Focus, type SankeyGraph } from "@/lib/analytics/sankey";

const PAD_LEFT = 88;
const PAD_RIGHT = 184;
const MIN_WIDTH = 640;
const NODE_W = 12;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Income into categories into merchants, as an SVG drawn at the width of its card (min 640px, scrolls sideways on a phone).
 * Hover or focus a node, or hover a flow, to light its path and dim the rest; tap pins it. All money arrives preformatted.
 */
export function CashFlowSankey({ graph, summary }: { graph: SankeyGraph; summary: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(880);
  const [hover, setHover] = useState<Focus>(null);
  const [pinned, setPinned] = useState<Focus>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setBoxWidth(Math.round(el.clientWidth));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = Math.max(boxWidth, MIN_WIDTH);
  const height = suggestHeight(graph);
  const layout = useMemo(() => layoutSankey(graph, { width, height, nodeWidth: NODE_W, gap: 10, minNode: 6, padLeft: PAD_LEFT, padRight: PAD_RIGHT }), [graph, width, height]);
  const maxCol = Math.max(...graph.nodes.map((n) => n.column));

  const active = hover ?? pinned;
  const path = useMemo(() => pathOf(graph, active), [graph, active]);
  const dimmed = active !== null;
  const same = (a: Focus, b: Focus) => a?.kind === b?.kind && a?.id === b?.id;
  const toggle = (f: NonNullable<Focus>) => setPinned((p) => (same(p, f) ? null : f));
  const readout = active ? describe(graph, active) : summary;

  return (
    <div>
      <div ref={box} className="overflow-x-auto" role="group" aria-label="Cash flow: income into categories, then merchants" tabIndex={0}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" onClick={() => setPinned(null)}>
          <g>
            {layout.links.map((l) => {
              const on = path.links.has(l.id);
              return (
                <path
                  key={l.id}
                  d={l.d}
                  className="cursor-pointer transition-[fill-opacity] duration-(--dur-fast)"
                  style={{ fill: l.color, fillOpacity: !dimmed ? 0.3 : on ? 0.62 : 0.07 }}
                  onMouseEnter={() => setHover({ kind: "link", id: l.id })}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle({ kind: "link", id: l.id });
                  }}
                >
                  <title>{describe(graph, { kind: "link", id: l.id })}</title>
                </path>
              );
            })}
          </g>
          <g>
            {layout.nodes.map((n) => {
              const on = path.nodes.has(n.id);
              const left = n.column === 0 && maxCol > 0;
              const lx = left ? n.x - 8 : n.x + n.w + 8;
              const cy = n.y + n.h / 2;
              const faded = dimmed && !on;
              const maxChars = n.column === 0 ? 12 : n.column === maxCol ? 22 : 18;
              return (
                <g
                  key={n.id}
                  tabIndex={0}
                  role="graphics-symbol"
                  aria-label={describe(graph, { kind: "node", id: n.id })}
                  className="cursor-pointer outline-offset-2 transition-[opacity] duration-(--dur-fast)"
                  style={{ opacity: faded ? 0.35 : 1 }}
                  onMouseEnter={() => setHover({ kind: "node", id: n.id })}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover({ kind: "node", id: n.id })}
                  onBlur={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle({ kind: "node", id: n.id });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle({ kind: "node", id: n.id });
                    }
                  }}
                >
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={2} style={{ fill: n.color, stroke: "var(--surface)", strokeWidth: 2 }} />
                  {/* a wider invisible target so thin nodes are easy to hit */}
                  <rect x={n.x - 4} y={n.y - 3} width={n.w + 8} height={n.h + 6} fill="transparent" />
                  <text
                    x={lx}
                    y={left ? cy - 3 : cy}
                    dy={left ? 0 : "0.32em"}
                    textAnchor={left ? "end" : "start"}
                    className="text-xs"
                    style={{ fill: "var(--text)", paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3, strokeLinejoin: "round" }}
                  >
                    {clip(n.label, maxChars)}
                    {left ? null : (
                      <tspan className="money" dx={6} style={{ fill: "var(--muted)" }}>
                        {n.valueText}
                      </tspan>
                    )}
                  </text>
                  {left ? (
                    <text x={lx} y={cy + 12} textAnchor="end" className="money text-xs" style={{ fill: "var(--muted)", paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3, strokeLinejoin: "round" }}>
                      {n.valueText}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="mt-3 min-h-5 text-sm text-muted" aria-live="polite">
        {readout}
      </p>
    </div>
  );
}
