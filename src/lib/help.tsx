import type { ReactNode } from "react";

/**
 * Plain-language explanations shown behind the ⓘ next to page and card titles.
 * One place so the wording stays consistent. Keep each entry short: what it shows, how to use it.
 */
export const HELP = {
  // ---- Pages -------------------------------------------------------------------------------
  overview: (
    <>
      <p>Your month at a glance. Move between months in the calendar.</p>
      <p>
        Big costs (EMIs, spread purchases, lump-sum trips) are <b>smoothed</b>: spread evenly over their months, so one big
        purchase doesn&apos;t make a month look terrible.
      </p>
      <p>
        <b>Everyday</b> (in the calendar header) shows only everyday, controllable spending in the calendar and the donut,
        and hides fixed or one-off costs like rent. It never changes the four summary numbers. Choose which categories
        are everyday in Settings → Categories.
      </p>
    </>
  ),
  transactions: (
    <>
      <p>
        <b>Month</b> shows every entry for the selected month: tap any row to edit, duplicate or delete it. <b>Year</b> drops
        the list and shows the whole calendar year: totals, categories and merchants.
      </p>
      <p>
        Filters (category, everyday only, trip, merchant, payment, search…) apply to everything on the page: the totals, the
        Jan–Dec chart, the breakdowns and the list. Use it to compare any slice month on month, e.g. “Eating out, this year”.
        Months that haven&apos;t started show lighter bars: those are planned amounts (EMIs, spread costs).
      </p>
      <p>
        A spread purchase shows as its monthly part (“3 of 12”).
      </p>
    </>
  ),
  trips: (
    <>
      <p>
        Trips keep holiday spending out of your monthly numbers. Tag an expense with a trip (under “More details” when
        adding, or with “Add expense” on the trip page).
      </p>
      <p>Each trip decides how it counts in your monthly spending:</p>
      <p>
        <b>Not counted</b> (default): tracked here only. <b>One lump sum</b>: the trip total counts once, in a category and
        month you choose, and can be spread over months. <b>Each expense</b>: every trip expense counts in its own category.
      </p>
    </>
  ),
  tripMode: (
    <p>
      Change this with Edit. <b>Not counted</b> keeps the trip out of every total. <b>One lump sum</b> adds the trip total
      once (pick the date and category; optionally spread it). <b>Each expense</b> adds every trip expense to its own
      category, as if it were normal spending.
    </p>
  ),
  tripBreakdown: <p>The trip&apos;s spending split by type (flights, hotel, food…), biggest first.</p>,
  plans: (
    <>
      <p>
        <b>Plans</b> are big purchases you paid for in full but want to count a bit each month, e.g. a $1,200 laptop
        as $100 a month for 12 months. That keeps one expensive month from skewing your averages and budgets.
      </p>
      <p>
        To make one, add the expense, turn on <b>Spread this cost</b> and keep <b>Paid upfront</b>. Each month&apos;s part
        then shows in Activity as “Spread 3/12”.
      </p>
      <p>Paying it off over time instead? That&apos;s an EMI, and lives in the EMIs tab.</p>
    </>
  ),
  emis: (
    <>
      <p>
        <b>EMIs</b> are purchases you&apos;re really paying off month by month (card or loan installments). Each installment
        counts in the month it&apos;s due, so this tab shows what&apos;s still owed and which months are already spoken for.
      </p>
      <p>
        To add one, add the purchase, turn on <b>Spread this cost</b> and choose <b>Paying in EMIs</b>. Installments show
        in Activity as “EMI 2/12”.
      </p>
      <p>Paid in full and only want it counted gradually? Use a plan instead (Plans tab).</p>
    </>
  ),
  cards: (
    <>
      <p>
        Every payment method marked as a credit card, with what you owe now, your latest bill and how much of your limit
        you&apos;re using. Purchases on the card add to what you owe; refunds lower it.
      </p>
      <p>
        <b>Mark payment</b> records a bill payment. It isn&apos;t an expense (the purchases already were), so it never
        changes your spending totals; it only lowers what&apos;s owed on the card.
      </p>
      <p>
        <b>EMI</b> purchases block the full amount of your limit straight away, while the bill only includes each
        installment as it falls due.
      </p>
    </>
  ),
  cardUtilization: (
    <p>
      How much of your combined credit limit you&apos;re using. Credit scores usually reward staying under 30%, and under
      10% is ideal. Paying before the statement date lowers the figure the bank reports.
    </p>
  ),
  plansCommitted: (
    <p>
      How much of your plans counts in each of the next 12 months. The money is already spent; this is what will still
      show up in those months&apos; totals.
    </p>
  ),
  emisCommitted: (
    <p>
      EMI installments due in each of the next 12 months. Tall bars are months that are already tight; check here before
      taking on a new EMI.
    </p>
  ),
  items: (
    <>
      <p>
        Every line item read from your receipts: what you bought, where, when and for how much. Search an item to see its
        purchase history and how its price has changed.
      </p>
      <p>Items are added when you read a receipt (receipt icon in the ＋ form).</p>
    </>
  ),
  insights: (
    <>
      <p>
        <b>Quick insights</b> are free, automatic checks, e.g. a category running well above its usual level or a budget on
        pace to go over.
      </p>
      <p>
        <b>Deep analysis</b> asks the AI to review your spending and suggest actions. It sends totals only (monthly
        category sums, budgets, top merchants), never individual transactions. It&apos;s limited per month to keep costs
        down, and results are saved so reopening them is free.
      </p>
    </>
  ),

  // ---- Overview cards ---------------------------------------------------------------------
  kpiSpent: (
    <p>
      Everything you spent this month: expenses minus refunds, for all categories. The bar shows how much of the month&apos;s budget is
      used (blue on track, amber from 80%, red when over) and the % chip compares with last month. The All spending / Everyday switch never changes this number.
    </p>
  ),
  kpiIncome: <p>Money received in income categories this month.</p>,
  kpiNet: <p>Income minus total spend. Green means you saved money this month, red means you spent more than you earned.</p>,
  kpiCore: (
    <p>
      Spending in categories marked Everyday: costs you can control, like groceries, eating out and shopping. Rent and
      other fixed costs are left out. Change which categories count in Settings → Categories.
    </p>
  ),
  trend: (
    <p>
      Spent vs income for the last 12 months; the highlighted bars are the month you&apos;re viewing. Tap a bar to jump to
      that month, or hover it for exact amounts. On the Overview it is shown as a small net-saved chart: green bars are months you saved, red bars months you spent more than you earned.
    </p>
  ),
  upcoming: (
    <p>
      Installments and future-dated expenses due in the next 30 days, plus what&apos;s already locked in for next month against that month&apos;s budget. Long-range commitments are in Transactions → Plans and EMIs.
    </p>
  ),
  calendar: (
    <>
      <p>
        Use ‹ › or tap the month to move around; the whole page follows the month shown here. Tap a day to see its total and every transaction.
      </p>
      <p>
        Each day is tinted by what happened on it, darker for bigger amounts. Pink to red is regular spending, purple is an EMI or a spread (paid-upfront) purchase, orange is a trip, and green is income or a refund. A day with spending and money coming in is tinted by the spending; the bar under the date shows every kind. Trips set to “not counted” are listed for reference but left out of totals.
      </p>
    </>
  ),
  donut: (
    <>
      <p>This month&apos;s spending by category: the top 5, with everything else grouped as Other. <b>Share</b> is each category&apos;s part of total spending, not how much of its budget is used. Tap a category to see its transactions.</p>
      <p>The thin bar under a category shows how much of its budget is used. Spent turns amber from 80% and red when over; a dash means no budget is set. Other categories near or over their limit appear under “Also watch”. With Core on, only core categories are shown. Budgets carry forward until you change them in Settings → Budgets.</p>
    </>
  ),
  quickInsights: (
    <p>
      Automatic checks on the month: categories well above their 3-month average, single big expenses, savings-rate swings,
      budget pace, EMIs finishing. Free and always up to date. “Deep analysis” uses the AI for a fuller review.
    </p>
  ),
  // ---- Transactions ------------------------------------------------------------------------
  filteredTotal: (
    <p>
      The total for your current filters in this period, compared with the previous one. The bars show the same filters for
      January to December; tap one to preview it, then choose “View” to open that month.
    </p>
  ),

  // ---- Settings ----------------------------------------------------------------------------
  profile: <p>Your display name and sign-in email. A new email takes effect after you confirm the link we send.</p>,
  security: <p>Change your password, sign out on every device, or find where to delete your account.</p>,
  preferences: (
    <>
      <p>
        <b>Default currency</b>: every total and budget is shown in it. Changing it converts all past transactions using the
        exchange rate from each transaction&apos;s own date.
      </p>
      <p>
        <b>Spread months</b>: pre-filled when you turn on “Spread this cost”.
      </p>
    </>
  ),
  categories: (
    <>
      <p>Categories group your spending and income. Each has an optional list of subcategories.</p>
      <p>
        <b>Everyday</b> marks everyday, controllable spending; the Everyday switch on the dashboard shows only these. Colour is used
        in charts. Archive hides a category from pickers but keeps its history. Deleting one that&apos;s in use asks where to
        move its transactions.
      </p>
    </>
  ),
  budgets: (
    <>
      <p>A monthly limit per category (or a target for income categories).</p>
      <p>
        Budgets <b>carry forward</b>: set Groceries to $400 in March and every later month uses $400 until you change it.
        Editing a month applies from that month onward; earlier months keep what they had.
      </p>
    </>
  ),
  payments: <p>Cards, accounts and cash you pay with. Optional on each transaction; filter by them on the Transactions page. Tap the star on one to make it the default: it is pre-selected on every new transaction. Tap the card icon to mark one as a credit card with its limit and billing days.</p>,
  people: <p>Who paid for an expense, you or someone else. For your information only: no balances or debts are tracked.</p>,
  merchants: (
    <p>
      Shops and payees, learned automatically as you add transactions. Each one remembers its category, so picking it next
      time fills the category for you. Merge duplicates (e.g. “Kroger” and “KROGER #512”) so their totals combine.
    </p>
  ),
  ai: (
    <p>
      The AI provider (Gemini, Claude or OpenAI, chosen by the server admin) powers describe-it entry, receipt reading, deep analysis, tidy-up, the unusual-spending check and Ask your data.
      Each account gets a monthly allowance per group that resets on the 1st. If the server has no AI key, these features stay hidden.
    </p>
  ),
  tidy: (
    <>
      <p>
        <b>Categorise</b>: suggests a better category for rows sitting in catch-all categories (Other, Uncategorized…) or missing a subcategory. Imported rows with no category land in
        Uncategorized, ready for this.
      </p>
      <p>
        <b>Merchants</b>: merges duplicates and cleans card-statement names, and fills in default categories. <b>Item names</b>: gives the same product one name across receipts.
      </p>
      <p>Nothing changes until you tick and apply. Rows you have reviewed are not sent again.</p>
    </>
  ),
  flags: (
    <p>
      An automatic check finds possible duplicates (same amount, merchant and category within 3 days) and expenses over 3× the usual for their category. The AI then explains each one
      in a sentence, or clears it when it&apos;s clearly expected (an EMI, a trip). Each item is checked once. Dismiss hides it.
    </p>
  ),
  ask: (
    <p>
      Ask about your own spending in plain words. The AI can only call read-only summaries of your data (monthly totals, category and merchant totals, a transaction search); it never
      sees your whole history at once and can&apos;t change anything. Each question uses one of your monthly questions.
    </p>
  ),
  data: <p>Bring in your spreadsheet, download everything you have, or start over. Wiping data or deleting the account asks for your current password.</p>,
  exporter: <p>XLSX and CSV are spreadsheets of your transactions. JSON is a complete backup of everything in your account.</p>,
} satisfies Record<string, ReactNode>;

export type HelpKey = keyof typeof HELP;
