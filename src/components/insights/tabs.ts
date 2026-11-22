/** Insights page tabs: shared by the server page and the client switch (no "use client", so the page can call these). */
export type InsightTab = "overview" | "categories" | "habits" | "ai";

export function parseInsightTab(tab: unknown): InsightTab {
  return tab === "categories" || tab === "habits" || tab === "ai" ? tab : "overview";
}

/** One line on what the tab shows, just under the title and tabs. */
export const INSIGHT_INTRO: Record<InsightTab, string> = {
  overview: "Spent against earned over the year, plus the few things worth noticing this month.",
  categories: "Each category against its usual level and its budget, so you can see what moved.",
  habits: "Who gets your money, what repeats every month, and which days you spend on.",
  ai: "A fuller review, questions about your data, and entries worth a second look.",
};
