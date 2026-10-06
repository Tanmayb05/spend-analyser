import type { ReactNode } from "react";

/**
 * Plain-language explanations shown behind the ⓘ next to page and card titles.
 * One place so the wording stays consistent. Keep each entry short: what it shows, how to use it.
 */
export const HELP = {
  // ---- Pages -------------------------------------------------------------------------------
  overview: (
    <>
      <p>Your month at a glance. Use ‹ › or tap the month to move around.</p>
      <p>
        <b>Normalized</b> spreads big costs (EMIs, spread purchases, lump-sum trips) evenly over their months, so one big
        purchase doesn&apos;t make a month look terrible. <b>Cash</b> shows money on the day it actually left your account.
      </p>
      <p>
        <b>Core</b> shows only everyday, controllable spending and hides fixed or one-off costs like rent. Choose which
        categories are core in Settings → Categories.
      </p>
    </>
  ),
  transactions: (
    <>
      <p>Every entry for the selected month. Tap any row to edit, duplicate or delete it.</p>
      <p>
        Filters (category, core only, trip, merchant, payment, search…) apply to everything on the page: the big total, the
        12-month chart and the list. Use it to compare any slice month on month, e.g. “Eating out, last 12 months”.
      </p>
      <p>
        In <b>Normalized</b> view a spread purchase shows as its monthly part (“3 of 12”); in <b>Cash</b> view it shows as
        the full payment.
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
      <p>A plan splits one big cost into monthly amounts. Create one from any expense with “Spread this cost”.</p>
      <p>
        <b>Paid upfront</b>: you paid everything at once but want it to count a bit each month, e.g. a $1,200 laptop as
        $100 a month for 12 months. <b>EMI</b>: you really are paying it off month by month.
      </p>
      <p>
        Normalized view counts both monthly. Cash view counts a paid-upfront purchase on the day you bought it, and an EMI as
        each installment is due.
      </p>
    </>
  ),
  plansCommitted: (
    <p>
      Installments due in each of the next 12 months across all your plans. Tall bars are months that are already tight;
      check here before taking on a new EMI.
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
        <b>Deep analysis</b> asks Gemini to review your spending and suggest actions. It sends totals only (monthly
        category sums, budgets, top merchants), never individual transactions. It&apos;s limited per month to keep costs
        down, and results are saved so reopening them is free.
      </p>
    </>
  ),

  // ---- Overview cards ---------------------------------------------------------------------
  kpiSpent: (
    <p>
      Expenses minus refunds for the month (core only when Core is on). The bar shows how much of the month&apos;s budget is
      used: blue on track, amber from 80%, red when over. The % chip compares with last month.
    </p>
  ),
  kpiIncome: <p>Money received in income categories this month, compared with your income target if you set one in Budgets.</p>,
  kpiNet: <p>Income minus spending. Green means you saved money this month, red means you spent more than you earned.</p>,
  kpiCore: (
    <p>
      Spending in categories marked Core: everyday costs you can control, like groceries, eating out and shopping. Rent and
      other fixed costs are left out. Change which categories count in Settings → Categories.
    </p>
  ),
  kpiLeftPerDay: <p>What&apos;s left of this month&apos;s budget divided by the days remaining. Spend less than this per day to finish on budget.</p>,
  kpiAvgPerDay: <p>Total spending for the month divided by its number of days.</p>,
  kpiCommitted: <p>Installments and future-dated expenses already scheduled for this month.</p>,
  trend: (
    <p>
      Spent vs income for the last 12 months; the highlighted bars are the month you&apos;re viewing. Tap a bar to jump to
      that month, or hover it for exact amounts.
    </p>
  ),
  calendar: <p>Dots mark days with spending. Tap a day to see its total and entries; tap it again to go back to the month.</p>,
  donut: <p>This month&apos;s spending by category: the top 5, with everything else grouped as Other. Tap a category to see its transactions.</p>,
  budgetBars: (
    <>
      <p>Each category&apos;s spending against its monthly budget, worst first. Near limit = 80% or more, Over = above 100%. Tap a row to see its transactions.</p>
      <p>Budgets carry forward each month until you change them in Settings → Budgets.</p>
    </>
  ),
  upcoming: (
    <p>
      Installments and future-dated expenses due in the next 30 days, plus what&apos;s already locked in for next month.
    </p>
  ),
  outlook: (
    <p>
      For each of the next 3 months: what installments and scheduled payments already take, against that month&apos;s total
      budget. The rest is room for everything else.
    </p>
  ),
  quickInsights: (
    <p>
      Automatic checks on the month: categories well above their 3-month average, single big expenses, savings-rate swings,
      budget pace, EMIs finishing. Free and always up to date. “Deep analysis” uses Gemini for a fuller review.
    </p>
  ),
  tripsThisMonth: <p>Trips with spending this month. “Not counted” trips are left out of every number on this page.</p>,
  recent: <p>The latest entries for this month. Tap one to edit it.</p>,

  // ---- Transactions ------------------------------------------------------------------------
  filteredTotal: (
    <p>
      The total for your current filters in this month, compared with last month and the 3 months before. The bars show the
      same filters over 12 months; tap one to jump to that month.
    </p>
  ),

  // ---- Settings ----------------------------------------------------------------------------
  profile: <p>Your display name and sign-in email. A new email takes effect after you confirm the link we send.</p>,
  security: <p>Change your password, sign out on every device, or permanently delete your account and all its data.</p>,
  preferences: (
    <>
      <p>
        <b>Default currency</b>: every total and budget is shown in it. Changing it converts all past transactions using the
        exchange rate from each transaction&apos;s own date.
      </p>
      <p>
        <b>Default view</b>: whether pages open in Normalized or Cash. <b>Spread months</b>: pre-filled when you turn on
        “Spread this cost”.
      </p>
    </>
  ),
  categories: (
    <>
      <p>Categories group your spending and income. Each has an optional list of subcategories.</p>
      <p>
        <b>Core</b> marks everyday, controllable spending; the Core switch on the dashboard shows only these. Colour is used
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
  payments: <p>Cards, accounts and cash you pay with. Optional on each transaction; filter by them on the Transactions page.</p>,
  people: <p>Who paid for an expense, you or someone else. For your information only: no balances or debts are tracked.</p>,
  merchants: (
    <p>
      Shops and payees, learned automatically as you add transactions. Each one remembers its category, so picking it next
      time fills the category for you. Merge duplicates (e.g. “Kroger” and “KROGER #512”) so their totals combine.
    </p>
  ),
  ai: (
    <p>
      Gemini powers describe-it entry, receipt reading and deep analysis. Each account gets a monthly allowance that resets
      on the 1st. If the server has no Gemini key, these features stay hidden.
    </p>
  ),
  data: <p>Bring in your spreadsheet, download everything you have, or start over.</p>,
  importer: (
    <>
      <p>
        <b>Expense Tracker workbook</b>: brings in categories, budgets, trips, people, payment methods and every expense,
        including EMI plans.
      </p>
      <p>
        <b>Any .xlsx / .csv</b>: needs Date, Type (expense, income or refund), Category and Amount columns. Optional:
        Subcategory, Merchant, Description, Currency, Payment, Paid by, Trip, Notes.
      </p>
      <p>You see a preview before anything is saved. Importing the same file twice adds its rows twice.</p>
    </>
  ),
  exporter: <p>XLSX and CSV are spreadsheets of your transactions. JSON is a complete backup of everything in your account.</p>,
} satisfies Record<string, ReactNode>;

export type HelpKey = keyof typeof HELP;
