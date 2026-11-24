"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import { addMonths, formatMonth, formatMonthYearShort, monthForYear, monthsOfYear } from "@/lib/dates";
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
 * It only writes the `m` param, so several pickers on one page (Overview: summary + calendar) always show the same month.
 */
export function PeriodPicker({ view, month, year, today, monthOnly = false }: { view: PeriodView; month: string; year: number; today: string; /** Hide the Month | Year switch (pages with no year view, like Overview). */ monthOnly?: boolean }) {
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
  // phones get "Nov 2026" so the picker can sit beside another control
  const shortLabel = view === "month" ? formatMonthYearShort(month) : label;

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
      {monthOnly ? null : <Segmented
        size="sm"
        ariaLabel="Period view"
        value={view}
        options={VIEW_OPTIONS}
        onChange={(v) => {
          if (v === view) return;
          setOpen(false);
          router.push(v === "year" ? href({ view: "year", y: month.slice(0, 4) }) : href({ view: null, y: null, m: monthForYear(year, month, today).slice(0, 7) }), { scroll: false });
        }}
      />}
      <div ref={root} className="relative flex h-10.5 items-center rounded-control border border-border bg-surface-2 p-1">
        <Link href={prev} scroll={false} aria-label={`Previous ${noun}`} className="grid h-8 w-8 place-items-center rounded-sm transition-colors hover:bg-surface-3 max-sm:w-6">
          <ChevronLeft size={18} />
        </Link>
        <button
          type="button"
          data-trigger
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={openPanel}
          className="flex h-8 items-center justify-center gap-2 rounded-sm px-3 text-sm font-medium transition-colors hover:bg-surface-3 sm:min-w-36 max-sm:whitespace-nowrap max-sm:px-1"
        >
          <CalendarDays size={16} className="text-faint max-sm:hidden" />
          <span className="sm:hidden">{shortLabel}</span>
          <span className="max-sm:hidden">{label}</span>
        </button>
        <Link href={next} scroll={false} aria-label={`Next ${noun}`} className="grid h-8 w-8 place-items-center rounded-sm transition-colors hover:bg-surface-3 max-sm:w-6">
          <ChevronRight size={18} />
        </Link>

        {open ? (
          <div
            id={panelId}
            role="dialog"
            aria-label={view === "month" ? "Choose month" : "Choose year"}
            className="absolute left-0 top-full z-30 mt-2 w-72 rounded-card border border-border bg-surface-2 p-3 shadow-pop"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label={view === "month" ? "Previous year" : "Earlier years"}
                onClick={() => (view === "month" ? setPickYear((y) => y - 1) : setWinStart((s) => s - YEAR_WINDOW))}
                className="grid h-8 w-8 place-items-center rounded-inset transition-colors hover:bg-surface-3"
              >
                <ChevronLeft size={16} />
              </button>
              <p className="num text-sm font-medium">{view === "month" ? pickYear : `${winStart} – ${winStart + YEAR_WINDOW - 1}`}</p>
              <button
                type="button"
                aria-label={view === "month" ? "Next year" : "Later years"}
                onClick={() => (view === "month" ? setPickYear((y) => y + 1) : setWinStart((s) => s + YEAR_WINDOW))}
                className="grid h-8 w-8 place-items-center rounded-inset transition-colors hover:bg-surface-3"
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
                          "grid h-10 place-items-center rounded-inset text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent",
                          selected ? "bg-surface-3 font-medium text-text ring-1 ring-inset ring-text/10" : "text-muted hover:bg-surface-3 hover:text-text",
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
                          "num grid h-10 place-items-center rounded-inset text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent",
                          selected ? "bg-surface-3 font-medium text-text ring-1 ring-inset ring-text/10" : "text-muted hover:bg-surface-3 hover:text-text",
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
                className="rounded-inset px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-surface-3"
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
