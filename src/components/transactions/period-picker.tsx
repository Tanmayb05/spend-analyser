"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import { addMonths, formatMonth, monthForYear, monthsOfYear } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type PeriodView = "month" | "year";

const VIEW_OPTIONS: { value: PeriodView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];
const YEAR_WINDOW = 12;

/**
 * Month | Year switch, prev/next arrows and a popover to jump straight to any month or year.
 * `month` is the `m` param (always set), `year` is the year being viewed.
 * Everything is a link: the page re-renders on the server like the rest of the filters.
 */
export function PeriodPicker({ view, month, year, today }: { view: PeriodView; month: string; year: number; today: string }) {
  const href = useParamHref();
  const router = useRouter();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pickYear, setPickYear] = useState(year); // month grid: year being browsed
  const [winStart, setWinStart] = useState(year - 5); // year grid: first year shown

  const monthHref = (m: string) => href({ view: null, y: null, m: m.slice(0, 7) });
  const yearHref = (y: number) => href({ view: "year", y: String(y) });
  const todayYear = Number(today.slice(0, 4));

  const prev = view === "month" ? monthHref(addMonths(month, -1)) : yearHref(year - 1);
  const next = view === "month" ? monthHref(addMonths(month, 1)) : yearHref(year + 1);
  const label = view === "month" ? formatMonth(month) : String(year);
  const noun = view === "month" ? "month" : "year";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("[data-trigger]")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // focus the selected cell so arrow keys work immediately
    grid.current?.querySelector<HTMLElement>("[data-selected='true']")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openPanel = () => {
    setPickYear(view === "month" ? Number(month.slice(0, 4)) : year);
    setWinStart(year - 5);
    setOpen((o) => !o);
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const cols = view === "month" ? 3 : 4;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    if (!step) return;
    const cells = Array.from(grid.current?.querySelectorAll<HTMLElement>("[data-cell]") ?? []);
    const i = cells.findIndex((c) => c === document.activeElement);
    const to = cells[i + step];
    if (to) {
      e.preventDefault();
      to.focus();
    }
  };

  const monthCells = monthsOfYear(pickYear);
  const selectedMonth = month.slice(0, 7);
  const thisMonth = today.slice(0, 7);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        size="sm"
        ariaLabel="Period view"
        value={view}
        options={VIEW_OPTIONS}
        onChange={(v) => {
          if (v === view) return;
          setOpen(false);
          router.push(v === "year" ? href({ view: "year", y: month.slice(0, 4) }) : href({ view: null, y: null, m: monthForYear(year, month, today).slice(0, 7) }), { scroll: false });
        }}
      />
      <div ref={root} className="relative flex items-center rounded-full border border-border bg-surface-2 p-1">
        <Link href={prev} scroll={false} aria-label={`Previous ${noun}`} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3">
          <ChevronLeft size={18} />
        </Link>
        <button
          type="button"
          data-trigger
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={openPanel}
          className="flex h-9 min-w-36 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium hover:bg-surface-3"
        >
          <CalendarDays size={15} className="text-faint" />
          {label}
        </button>
        <Link href={next} scroll={false} aria-label={`Next ${noun}`} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3">
          <ChevronRight size={18} />
        </Link>

        {open ? (
          <div
            id={panelId}
            role="dialog"
            aria-label={view === "month" ? "Choose month" : "Choose year"}
            className="absolute left-0 top-full z-30 mt-2 w-72 rounded-3xl border border-border bg-surface-2 p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label={view === "month" ? "Previous year" : "Earlier years"}
                onClick={() => (view === "month" ? setPickYear((y) => y - 1) : setWinStart((s) => s - YEAR_WINDOW))}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-3"
              >
                <ChevronLeft size={16} />
              </button>
              <p className="num text-sm font-medium">{view === "month" ? pickYear : `${winStart} – ${winStart + YEAR_WINDOW - 1}`}</p>
              <button
                type="button"
                aria-label={view === "month" ? "Next year" : "Later years"}
                onClick={() => (view === "month" ? setPickYear((y) => y + 1) : setWinStart((s) => s + YEAR_WINDOW))}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-3"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div ref={grid} onKeyDown={onGridKey} className={cn("grid gap-1.5", view === "month" ? "grid-cols-3" : "grid-cols-4")}>
              {view === "month"
                ? monthCells.map((m) => {
                    const ym = m.slice(0, 7);
                    const selected = ym === selectedMonth;
                    return (
                      <Link
                        key={m}
                        data-cell
                        data-selected={selected}
                        href={monthHref(m)}
                        scroll={false}
                        onClick={() => setOpen(false)}
                        aria-current={selected ? "date" : undefined}
                        className={cn(
                          "grid h-10 place-items-center rounded-2xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          selected ? "bg-text font-medium text-bg" : "text-muted hover:bg-surface-3 hover:text-text",
                          !selected && ym === thisMonth && "ring-1 ring-inset ring-accent text-text",
                        )}
                      >
                        {formatMonth(m, "short")}
                      </Link>
                    );
                  })
                : Array.from({ length: YEAR_WINDOW }, (_, i) => winStart + i).map((y) => {
                    const selected = y === year;
                    return (
                      <Link
                        key={y}
                        data-cell
                        data-selected={selected}
                        href={yearHref(y)}
                        scroll={false}
                        onClick={() => setOpen(false)}
                        aria-current={selected ? "date" : undefined}
                        className={cn(
                          "num grid h-10 place-items-center rounded-2xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          selected ? "bg-text font-medium text-bg" : "text-muted hover:bg-surface-3 hover:text-text",
                          !selected && y === todayYear && "ring-1 ring-inset ring-accent text-text",
                        )}
                      >
                        {y}
                      </Link>
                    );
                  })}
            </div>

            <div className="mt-3 flex justify-end border-t border-border pt-2">
              <Link
                href={view === "month" ? monthHref(today) : yearHref(todayYear)}
                scroll={false}
                onClick={() => setOpen(false)}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
              >
                {view === "month" ? "This month" : "This year"}
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
