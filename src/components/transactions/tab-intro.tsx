/** Transactions page tabs: shared by the server page and the client switch (no "use client", so the page can call these). */
export type TxnTab = "activity" | "plans" | "cards";

/** Resolves `?tab=`. The retired `emis` tab (and `plans&pk=emi`) now lands on Plans, which shows both kinds. */
export function parseTxnTab(tab: unknown): TxnTab {
  if (tab === "plans" || tab === "emis" || tab === "cards") return tab === "emis" ? "plans" : tab;
  return "activity";
}

/** One line on what the tab shows and why it exists. The ⓘ beside the title has the longer version. */
const TAB_INTRO: Record<TxnTab, string> = {
  activity: "Every expense and income entry, month by month. Filter it any way to see where the money goes.",
  plans: "Big purchases counted over several months, paid upfront or in EMIs: what's left, what lands next and when each one ends.",
  cards: "What you owe on each credit card, your next bill and how much of your limit you're using.",
};

/** The tab's one-liner, just under the title and tabs. */
export function TabIntro({ tab }: { tab: TxnTab }) {
  return <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted">{TAB_INTRO[tab]}</p>;
}
