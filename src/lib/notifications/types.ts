export type NoticeGroup = "cards" | "budget" | "ai" | "other";
export type NoticeTone = "bad" | "warn" | "good" | "neutral";

export type NoticeKind =
  | "card-due-soon"
  | "card-overdue"
  | "card-min-due"
  | "card-statement-ready"
  | "card-utilization"
  | "rule-insight"
  | "month-review"
  | "budget"
  | "emi-upcoming"
  | "next-month-committed"
  | "ai-flags"
  | "tidy-backlog"
  | "ai-allowance"
  | "ai-errors"
  | "trip";

export type NoticeAction = {
  label: string;
  href?: string;
  kind?: "log-payment" | "write-review";
};

export type Notice = {
  /** stable across loads and scoped to its period (e.g. "card-due|<pmId>|2026-12-05"), so read/dismiss state sticks to one occurrence */
  id: string;
  kind: NoticeKind;
  group: NoticeGroup;
  tone: NoticeTone;
  title: string;
  detail?: string;
  /** ISO date the notice is about (due date, statement date, month start…) */
  at: string;
  href?: string;
  action?: NoticeAction;
  /** month-review only: the cached digest, or null when it has not been written yet */
  review?: {
    month: string;
    label: string;
    cached: { headline: string; summary: string } | null;
    left: number;
  };
  read?: boolean;
};

export const GROUP_LABEL: Record<NoticeGroup, string> = {
  cards: "Cards",
  budget: "Budget",
  ai: "AI",
  other: "Other",
};
