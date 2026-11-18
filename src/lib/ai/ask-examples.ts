/**
 * Starter questions for "Ask your data". Each one is answerable with the Q&A tools in ./tools.ts
 * (monthly totals, category breakdown, top merchants, find transactions), so a tap never wastes a question.
 */
export const ASK_EXAMPLES = [
  // totals and trends (monthly_totals)
  "How much did I spend last month?",
  "How much did I save each month this year?",
  "Which month this year did I spend the most?",
  "Did my spending go up compared with 3 months ago?",
  "What's my average monthly spending over the last 6 months?",
  "How does this month compare with the same month last year?",
  "Was my income higher than my spending every month this year?",
  "What's my total spending so far this year?",
  // categories (category_breakdown)
  "How much did I spend on food last month?",
  "What were my top 3 spending categories this year?",
  "Which category grew the most compared with last month?",
  "How much did I spend on transport in the last 3 months?",
  "What share of my spending went to groceries this year?",
  "Which subcategories make up most of my dining spending?",
  "Where did my income come from this year?",
  "How much did I spend on shopping last quarter?",
  // merchants (top_merchants)
  "What were my top 5 merchants this year?",
  "Where do I spend the most on food?",
  "Which store did I spend the most at last month?",
  "Who are my top 3 grocery merchants?",
  "How much did I spend at Amazon this year?",
  "Which merchants did I spend over $100 at last month?",
  // individual entries (find_transactions)
  "What were my 5 biggest purchases this year?",
  "List every expense over $200 in the last 3 months.",
  "How many times did I eat out last month?",
  "How much have I spent on coffee this year?",
  "Show my Uber and Lyft rides from last month.",
  "What subscriptions did I pay for last month?",
  "When did I last pay rent, and how much was it?",
  "How much did I spend on flights this year?",
] as const;

/** `n` distinct questions in random order (Fisher–Yates on a copy). `rand` is injectable for tests. */
export function pickAskExamples(n = 5, rand: () => number = Math.random): string[] {
  const a: string[] = [...ASK_EXAMPLES];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
