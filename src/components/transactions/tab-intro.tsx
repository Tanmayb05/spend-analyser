/** Transactions page tabs: shared by the server page and the client switch (no "use client", so the page can call these). */
export type TxnTab = "activity" | "plans" | "emis" | "cards";

/** Resolves `?tab=` (plus the retired `pk` sub-filter: `?tab=plans&pk=emi` now means the EMIs tab). */
export function parseTxnTab(tab: unknown, pk: unknown): TxnTab {
  if (tab === "emis" || (tab === "plans" && pk === "emi")) return "emis";
  if (tab === "plans" || tab === "cards") return tab;
  return "activity";
}

/** One line on what the tab shows and why it exists. The ⓘ beside the title has the longer version. */
const TAB_INTRO: Record<TxnTab, string> = {
  activity: "Every expense and income entry, month by month. Filter it any way to see where the money goes.",
  plans: "Big purchases you paid for in one go, counted a slice each month so no single month looks out of line.",
  emis: "Purchases you're paying off in installments: what's still owed, what's due next and when each one ends.",
  cards: "What you owe on each credit card, your next bill and how much of your limit you're using.",
};

/** The tab's one-liner, just under the title and tabs. */
export function TabIntro({ tab }: { tab: TxnTab }) {
  return <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted">{TAB_INTRO[tab]}</p>;
}
