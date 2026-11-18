"use client";

import { Suspense, useMemo, useState, useTransition, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlarmClock,
  BellOff,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  CreditCard,
  Flag,
  Gauge,
  Lightbulb,
  MoreHorizontal,
  Newspaper,
  PiggyBank,
  Plane,
  ReceiptText,
  TriangleAlert,
  Wand2,
  X,
  type LucideProps,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { useAppData } from "@/components/app-data";
import { runAnalysisAction } from "@/app/(app)/ai/actions";
import { monthStart, relativeDays } from "@/lib/dates";
import { GROUP_LABEL, type NoticeGroup, type NoticeKind, type NoticeTone } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { useNoticeList, useNotifications, type ListedNotice } from "./notifications-provider";

type Filter = "all" | NoticeGroup;

const ICON: Record<NoticeKind, ComponentType<LucideProps>> = {
  "card-due-soon": CalendarClock,
  "card-overdue": TriangleAlert,
  "card-min-due": CreditCard,
  "card-statement-ready": ReceiptText,
  "card-utilization": Gauge,
  "rule-insight": Lightbulb,
  "month-review": Newspaper,
  budget: PiggyBank,
  "emi-upcoming": CalendarClock,
  "next-month-committed": AlarmClock,
  "ai-flags": Flag,
  "tidy-backlog": Wand2,
  "ai-allowance": Bot,
  "ai-errors": TriangleAlert,
  trip: Plane,
};

const TONE: Record<NoticeTone, string> = {
  bad: "bg-bad/15 text-bad",
  warn: "bg-warn/15 text-warn",
  good: "bg-good/15 text-good",
  neutral: "bg-surface-3 text-muted",
};

export function NotificationPanel() {
  const { open, setOpen } = useNotifications();
  return (
    <Sheet side="left" open={open} onClose={() => setOpen(false)} title={<Suspense fallback="Notifications"><PanelTitle /></Suspense>} actions={<Suspense fallback={null}><MarkAllRead /></Suspense>}>
      <Suspense fallback={<PanelSkeleton />}>
        <PanelBody />
      </Suspense>
    </Sheet>
  );
}

function PanelTitle() {
  const { unread } = useNoticeList();
  return (
    <span className="flex items-center gap-2">
      Notifications
      {unread ? <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-muted">{unread} new</span> : null}
    </span>
  );
}

function MarkAllRead() {
  const { notices, unread } = useNoticeList();
  const { markRead } = useNotifications();
  if (!unread) return null;
  return (
    <button
      type="button"
      onClick={() => markRead(notices.filter((n) => !n.read && !n.hidden).map((n) => n.id))}
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted hover:bg-surface-3 hover:text-text"
    >
      <Check size={14} /> Mark all read
    </button>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Loading notifications">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}

function PanelBody() {
  const { notices } = useNoticeList();
  const { today } = useAppData();
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, cards: 0, budget: 0, ai: 0, other: 0 };
    for (const n of notices) {
      if (n.read || n.hidden) continue;
      c.all++;
      c[n.group]++;
    }
    return c;
  }, [notices]);

  const sections = useMemo(() => {
    const list = notices.filter((n) => filter === "all" || n.group === filter);
    const month = monthStart(today);
    // unread first; due dates closest to today first
    const order = (a: ListedNotice, b: ListedNotice) =>
      Number(!!a.read) - Number(!!b.read) || Math.abs(Date.parse(a.at) - Date.parse(today)) - Math.abs(Date.parse(b.at) - Date.parse(today));
    const urgent = list.filter((n) => n.tone === "bad");
    const rest = list.filter((n) => n.tone !== "bad");
    return [
      { key: "urgent", title: "Needs attention", items: urgent.sort(order) },
      { key: "month", title: "This month", items: rest.filter((n) => n.at >= month).sort(order) },
      { key: "earlier", title: "Earlier", items: rest.filter((n) => n.at < month).sort(order) },
    ].filter((s) => s.items.length);
  }, [notices, filter, today]);

  const options = (["all", "cards", "budget", "ai", "other"] as const).map((v) => ({
    value: v,
    label: `${v === "all" ? "All" : GROUP_LABEL[v]}${counts[v] ? ` ${counts[v]}` : ""}`,
  }));

  return (
    <>
      <div className="-mx-1 mb-4 overflow-x-auto px-1">
        <Segmented size="sm" value={filter} onChange={setFilter} options={options} ariaLabel="Filter notifications" />
      </div>
      {sections.length === 0 ? (
        <EmptyState title="You're all caught up" body="Card due dates, budget alerts and AI reviews show up here." />
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {sections.map((s) => (
            <section key={s.key} aria-label={s.title}>
              <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-faint">{s.title}</h3>
              <ul className="grid grid-cols-1 gap-2">
                {s.items.map((n) => (n.hidden ? <HiddenRow key={n.id} n={n} /> : <NoticeRow key={n.id} n={n} today={today} />))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function HiddenRow({ n }: { n: ListedNotice }) {
  const { restore } = useNotifications();
  return (
    <li className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-3 py-2.5 text-xs text-muted">
      <span className="min-w-0 truncate">
        {n.hidden === "snoozed" ? "Snoozed for 3 days" : "Dismissed"}: {n.title}
      </span>
      <button type="button" onClick={() => restore(n.id)} className="shrink-0 font-medium text-accent hover:underline">
        Undo
      </button>
    </li>
  );
}

function NoticeRow({ n, today }: { n: ListedNotice; today: string }) {
  const { markRead, hide, setOpen } = useNotifications();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [review, setReview] = useState(n.review?.cached ?? null);
  const [writing, startWriting] = useTransition();
  const Icon = ICON[n.kind];
  const isReview = n.kind === "month-review" && n.review;
  const reviewHref = n.review ? `/insights?${new URLSearchParams({ m: n.review.month.slice(0, 7), scope: "month" })}` : "/insights";

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const go = () => {
    if (!n.read) markRead([n.id]);
    if (isReview) return setExpanded((v) => !v);
    if (n.href) navigate(n.href);
  };
  const writeReview = () =>
    startWriting(async () => {
      const r = await runAnalysisAction({ scope: "month", month: n.review!.month });
      if (!r.ok) return void toast.error(r.error);
      setReview(r.result);
      setExpanded(true);
      if (!n.read) markRead([n.id]);
      router.refresh();
    });
  const runAction = () => {
    if (n.action?.kind === "write-review") return writeReview();
    if (!n.read) markRead([n.id]);
    if (n.action?.href) navigate(n.action.href);
  };
  const showAction = n.action && !(n.action.kind === "write-review" && review);

  return (
    <li className={cn("relative rounded-2xl border transition", n.read ? "border-transparent bg-surface-2/50" : "border-border bg-surface-2")}>
      <div className="flex gap-3 p-3">
        <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl", TONE[n.tone])}>
          <Icon size={17} />
        </span>
        <button type="button" onClick={go} className="min-w-0 flex-1 text-left">
          <span className="flex items-start gap-2">
            <span className={cn("min-w-0 flex-1 text-sm leading-snug", n.read ? "text-muted" : "font-medium text-text")}>{n.title}</span>
            {!n.read ? <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
          </span>
          {n.detail && !(isReview && review) ? <span className="mt-0.5 block text-xs leading-relaxed text-muted">{n.detail}</span> : null}
          {isReview && review ? <span className="mt-0.5 block text-xs leading-relaxed text-muted">{review.headline}</span> : null}
          <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-faint">
            {relativeDays(n.at, today)} · {GROUP_LABEL[n.group]}
            {isReview ? <ChevronDown size={12} className={cn("transition", expanded && "rotate-180")} /> : null}
          </span>
        </button>
        <RowMenu read={!!n.read} onRead={() => markRead([n.id])} onSnooze={() => hide(n.id, { snoozeDays: 3 })} onDismiss={() => hide(n.id, "dismiss")} />
      </div>

      {isReview && expanded ? (
        <div className="mx-3 mb-3 rounded-xl border border-border bg-surface p-3 text-sm">
          {review ? (
            <>
              <p className="font-medium">{review.headline}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{review.summary}</p>
              <Link href={reviewHref} onClick={() => setOpen(false)} className="mt-2 inline-block text-xs font-medium text-accent">
                Open full review →
              </Link>
            </>
          ) : (
            <p className="text-xs text-muted">A short AI review of {n.review!.label}: what changed, where money went, and what to watch. Uses one of your monthly analyses.</p>
          )}
        </div>
      ) : null}

      {showAction ? (
        <div className="-mt-1 flex gap-2 px-3 pb-3 pl-[60px]">
          <Button
            size="sm"
            variant={n.tone === "bad" ? "accent" : "outline"}
            className="h-8 text-xs"
            onClick={runAction}
            disabled={writing || (n.action!.kind === "write-review" && (n.review?.left ?? 0) <= 0)}
          >
            {writing ? "Writing…" : n.action!.label}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function RowMenu({ read, onRead, onSnooze, onDismiss }: { read: boolean; onRead: () => void; onSnooze: () => void; onDismiss: () => void }) {
  const item = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-surface-3";
  const close = (e: React.MouseEvent) => ((e.currentTarget.closest("details") as HTMLDetailsElement).open = false);
  return (
    <details data-overlay className="relative shrink-0 self-start">
      <summary
        aria-label="More options"
        className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal size={16} />
      </summary>
      <div className="absolute right-0 top-9 z-10 w-40 rounded-xl border border-border bg-surface p-1 shadow-xl">
        {!read ? (
          <button type="button" className={item} onClick={(e) => (close(e), onRead())}>
            <Check size={14} /> Mark read
          </button>
        ) : null}
        <button type="button" className={item} onClick={(e) => (close(e), onSnooze())}>
          <BellOff size={14} /> Snooze 3 days
        </button>
        <button type="button" className={cn(item, "text-bad")} onClick={(e) => (close(e), onDismiss())}>
          <X size={14} /> Dismiss
        </button>
      </div>
    </details>
  );
}
