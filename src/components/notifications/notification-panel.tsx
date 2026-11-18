"use client";

import { useMemo, useState, type ComponentType } from "react";
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
import { monthStart, relativeDays } from "@/lib/dates";
import { GROUP_LABEL, type Notice, type NoticeGroup, type NoticeKind, type NoticeTone } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { useNotifications } from "./notifications-provider";

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
  const { notices, unread, open, setOpen, markAllRead } = useNotifications();
  const { today } = useAppData();
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: 0,
      cards: 0,
      budget: 0,
      ai: 0,
      other: 0,
    };
    for (const n of notices) {
      if (n.read) continue;
      c.all++;
      c[n.group]++;
    }
    return c;
  }, [notices]);

  const sections = useMemo(() => {
    const list = notices.filter((n) => filter === "all" || n.group === filter);
    const month = monthStart(today);
    const urgent = list.filter((n) => n.tone === "bad");
    const rest = list.filter((n) => n.tone !== "bad");
    const byRecent = (a: Notice, b: Notice) => Number(!!a.read) - Number(!!b.read) || b.at.localeCompare(a.at);
    return [
      { key: "urgent", title: "Needs attention", items: urgent.sort(byRecent) },
      {
        key: "month",
        title: "This month",
        items: rest.filter((n) => n.at >= month).sort(byRecent),
      },
      {
        key: "earlier",
        title: "Earlier",
        items: rest.filter((n) => n.at < month).sort(byRecent),
      },
    ].filter((s) => s.items.length);
  }, [notices, filter, today]);

  const options = (["all", "cards", "budget", "ai", "other"] as const).map((v) => ({
    value: v,
    label: `${v === "all" ? "All" : GROUP_LABEL[v]}${counts[v] ? ` ${counts[v]}` : ""}`,
  }));

  return (
    <Sheet
      side="left"
      open={open}
      onClose={() => setOpen(false)}
      title={
        <span className="flex items-center gap-2">
          Notifications
          {unread ? <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-muted">{unread} new</span> : null}
        </span>
      }
      actions={
        unread ? (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted hover:bg-surface-3 hover:text-text"
          >
            <Check size={14} /> Mark all read
          </button>
        ) : null
      }
    >
      <div className="-mx-1 mb-4 overflow-x-auto px-1">
        <Segmented size="sm" value={filter} onChange={setFilter} options={options} ariaLabel="Filter notifications" />
      </div>

      {sections.length === 0 ? (
        <EmptyState title="You're all caught up" body="Card due dates, budget alerts and AI reviews show up here." />
      ) : (
        <div className="grid gap-5">
          {sections.map((s) => (
            <section key={s.key} aria-label={s.title}>
              <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-faint">{s.title}</h3>
              <ul className="grid gap-2">
                {s.items.map((n) => (
                  <NoticeRow key={n.id} n={n} today={today} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-faint">Skeleton preview · sample data</p>
    </Sheet>
  );
}

function NoticeRow({ n, today }: { n: Notice; today: string }) {
  const { markRead, hide, setOpen } = useNotifications();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const Icon = ICON[n.kind];
  const isReview = n.kind === "month-review" && n.review;

  const go = () => {
    markRead([n.id]);
    if (isReview) return setExpanded((v) => !v);
    if (n.href) {
      setOpen(false);
      router.push(n.href);
    }
  };
  const doHide = (how: "dismiss" | { snoozeDays: number }) => {
    const undo = hide(n.id, how);
    toast(how === "dismiss" ? "Dismissed" : `Snoozed for ${how.snoozeDays} days`, { action: { label: "Undo", onClick: undo } });
  };
  const runAction = () => {
    markRead([n.id]);
    if (n.action?.href) {
      setOpen(false);
      router.push(n.action.href);
    } else toast.info(`Skeleton: "${n.action?.label}" will work in the real version`);
  };

  return (
    <li className={cn("group relative rounded-2xl border transition", n.read ? "border-transparent bg-surface-2/50" : "border-border bg-surface-2")}>
      <div className="flex gap-3 p-3">
        <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl", TONE[n.tone])}>
          <Icon size={17} />
        </span>
        <button type="button" onClick={go} className="min-w-0 flex-1 text-left">
          <span className="flex items-start gap-2">
            <span className={cn("min-w-0 flex-1 text-sm leading-snug", n.read ? "text-muted" : "font-medium text-text")}>{n.title}</span>
            {!n.read ? <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
          </span>
          {n.detail ? <span className="mt-0.5 block text-xs leading-relaxed text-muted">{n.detail}</span> : null}
          <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-faint">
            {relativeDays(n.at, today)} · {GROUP_LABEL[n.group]}
            {isReview ? <ChevronDown size={12} className={cn("transition", expanded && "rotate-180")} /> : null}
          </span>
        </button>
        <RowMenu read={!!n.read} onRead={() => markRead([n.id])} onSnooze={() => doHide({ snoozeDays: 3 })} onDismiss={() => doHide("dismiss")} />
      </div>

      {isReview && expanded ? (
        <div className="mx-3 mb-3 rounded-xl border border-border bg-surface p-3 text-sm">
          {n.review!.cached ? (
            <>
              <p className="font-medium">{n.review!.cached.headline}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{n.review!.cached.summary}</p>
              <Link href="/insights" onClick={() => setOpen(false)} className="mt-2 inline-block text-xs font-medium text-accent">
                Open full review →
              </Link>
            </>
          ) : (
            <p className="text-xs text-muted">A short AI review of {n.review!.label}: what changed, where money went, and what to watch.</p>
          )}
        </div>
      ) : null}

      {n.action ? (
        <div className="-mt-1 flex gap-2 px-3 pb-3 pl-[60px]">
          <Button size="sm" variant={n.tone === "bad" ? "accent" : "outline"} className="h-8 text-xs" onClick={runAction}>
            {n.action.label}
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
