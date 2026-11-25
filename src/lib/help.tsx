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
      <p>
        Trips that have ended show as stamps under “Visited”. Press and drag a stamp up or down to spin it like a fridge magnet; a harder flick spins it longer. On a phone, hold it for a moment first so swiping still scrolls the page. Tap or click to open the trip.
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
  tripBreakdown: <p>The trip&apos;s spending split by type (flights, hotel, food…), biggest first. Hover a bar segment or a row to highlight it.</p>,
  plans: (
    <>
      <p>
        <b>Plans</b> are big purchases you count over several months instead of all at once, e.g. a $1,200 laptop as
        $100 a month for 12 months. That keeps one expensive month from skewing your averages and budgets.
      </p>
      <p>
        <b>Paid upfront</b> means you already paid in full and only the counting is spread. Each month&apos;s part shows in
        Activity as “Spread 3/12”.
      </p>
      <p>
        <b>EMI</b> means you&apos;re paying it off month by month (card or loan installments). Each installment counts in the
        month it&apos;s due and shows in Activity as “EMI 2/12”.
      </p>
      <p>To add one, add the purchase, turn on <b>Spread this cost</b> and pick which kind it is.</p>
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
      What your plans put into each of the next 12 months: the monthly slice of paid-upfront purchases plus EMI
      installments. Tall bars are months that are already tight; check here before taking on a new EMI.
    </p>
  ),
  items: (
    <>
      <p>
        Every line item read from your receipts: what you bought, where, when and for how much. Search an item to see its
        purchase history and how its price has changed.
      </p>
      <p>
        Each item has a shelf tag: its latest unit price, how much it moved against the previous purchase (amber up, green down,
        grey when under 1%), a sparkline of its recent prices and where and when you last bought it.
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
  forecast: (
    <>
      <p>
        A projection for the current month: what you have spent so far, plus entries already booked for later (EMIs, scheduled expenses), plus your everyday (core) spending for the days that remain. That daily pace blends this month so far with the median of your last 3 months: early in the month it leans on your history, later it leans on this month. A shaded “likely range” at the month end shows the projection if the rest of the month ran like your quietest and your busiest recent month.
      </p>
      <p>
        One-off spending outside the everyday categories is not extrapolated. With no earlier months to learn from, it needs at least 3 days of data before it shows a number. The chart reads like a route from day 1 to the last day: the solid line is what you have spent, the dot is today, the dashed blue line is where this pace ends the month, and the dotted grey line is an even pace to your budget (or to last month&apos;s total when no budget is set). The label above it says how far under or over that even pace you are. “Left per day on budget” is what remains of the total budget after spent and booked, divided by the days left.
      </p>
    </>
  ),
  cashFlow: (
    <>
      <p>
        Read left to right: your income for the month splits into categories, and each category splits into its biggest merchants (two per category; the rest of a category is grouped as “Other” beside it). Thicker bands are bigger amounts, and one scale is used throughout.
      </p>
      <p>
        If you earned more than you spent, the leftover flows into <b>Saved</b>. If you spent more than you earned, the gap is drawn as <b>Beyond income</b> and shared across the categories. Beyond the top 6 categories, the rest are grouped as “Other categories”. Same counting as the summary: smoothed EMIs, refunds netted, scheduled entries left out.
      </p>
      <p>Hover or tab to a node, or hover a flow, to light up its whole path and dim the rest. Tap to keep it lit; tap the background to clear it. On a phone the chart scrolls sideways.</p>
    </>
  ),
  yearHeatmap: (
    <p>
      One square per day for the 12 months up to the end of the year you are viewing (or up to today, for the current year), each column a week. Darker means more spent that day, in four steps set by your own spending days: the darkest quarter of your spending days is the darkest step. Days with nothing spent stay grey. Refunds net against the day, and scheduled (future) entries and income are left out. It follows the filters above (category, merchant, everyday only and so on). Hover or focus a square for its amount.
    </p>
  ),
  categoryMovers: (
    <p>
      Pick what to compare with: the 3-month average (“usual”), last month, or the same month last year. The first card says in one sentence whether you are spending more or less, and shows this month&apos;s total as a dark bar over the comparison in grey. “Spending more on” and “Spending less on” list the categories that changed most: the coloured bar is this month, the grey bar under it is the comparison, and the figure is the difference. A percent only appears when the comparison is at least 20, and “new” means nothing was spent there before. Changes under 10, or under 5%, go in “About the same”. Budgets have their own gauges above. Tap a row to see its transactions.
    </p>
  ),
  merchantsInsight: (
    <p>
      Where the month&apos;s money went, by merchant, with what you usually spend there. “New this month” means no spending there in the 3 months before. Only transactions with a merchant are counted.
    </p>
  ),
  recurring: (
    <p>
      Merchants charged in at least 3 of the last 4 months with an amount that stays within 20% of its usual size, which is how subscriptions and fixed bills look. Installments and spread plans are tracked in Transactions → Plans and EMIs, so they are left out here.
    </p>
  ),
  rhythm: (
    <p>
      Average spent on each day of the week over the last 3 months. Installments and spread plans are left out because they land on fixed dates and say nothing about your habits.
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
  shortcuts: (
    <>
      <p>
        Press <b>?</b> anywhere to see every shortcut, or <b>⌘K</b> (<b>Ctrl+K</b> on Windows) to jump to any page or setting.
      </p>
      <p>
        <b>Change</b> a shortcut, then press the new keys. A plain key can be followed by a second one, like G then T. Keys the browser
        keeps for itself can&apos;t be used, and two shortcuts can&apos;t share keys.
      </p>
      <p>Turning single-key shortcuts off helps with speech input or stray key presses. Shortcuts with ⌘, Ctrl or Alt keep working.</p>
    </>
  ),
  preferences: (
    <>
      <p>
        <b>Default currency</b>: every total and budget is shown in it. Changing it converts all past transactions using the
        exchange rate from each transaction&apos;s own date.
      </p>
      <p>
        <b>Spread months</b>: pre-filled when you turn on “Spread this cost”.
      </p>
      <p>
        <b>Add transaction opens</b>: “Describe it” lets you type or say what you spent, then check the result and save. “Form”
        opens the short form. Both are one tap away from inside the sheet.
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
  people: <p>Who paid for an expense, you or someone else. Settle up below turns that into a balance per person.</p>,
  settleUp: (
    <>
      <p>
        Built only from <b>Paid by</b>, since transactions have no split. Every expense is treated as your own spend: when
        someone else paid, you owe them that amount.
      </p>
      <p>
        A refund tagged to a person went back to them, so it takes that much off what you owe. If refunds are bigger than what they paid, they owe you the difference.
        Income is ignored, and expenses paid by you or with no payer never create a debt.
      </p>
      <p>The bar shows what you paid on the left and what they paid on the right. Nothing is recorded as settled; the balance covers all time.</p>
    </>
  ),
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
  data: <p>Bring in your spreadsheet, download everything you have, or find where to start over.</p>,
  about: (
    <p>
      A short video tour, the steps to get set up, and where the source code lives. The same tour opens once after you sign
      up.
    </p>
  ),
  reset: <p>Wipe your data, wipe it together with your categories and payment methods, or delete the account. Each asks for your current password and cannot be undone.</p>,
  exporter: <p>XLSX and CSV are spreadsheets of your transactions. JSON is a complete backup of everything in your account.</p>,
} satisfies Record<string, ReactNode>;

export type HelpKey = keyof typeof HELP;
