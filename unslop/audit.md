# Unslop audit (Phase 0, polish mode)

Method: greps over `src/` plus screenshots in `unslop/before/{mobile,desktop}-{dark,light}/` (112 shots, 28 per set).
Re-run: `node --env-file=.env.local unslop/shoot.mjs after`.
Verdict: **light slop**. No gradients, glows, gradient text, emoji or purple Tailwind classes. Polish mode.

## Type
- Uppercase tracked labels (20):
  `settings/ai/page.tsx:36`, `settings/ai/usage/page.tsx:96,138,150`, `trips/[id]/page.tsx:67`,
  `settings/budgets-editor.tsx:55,63`, `settings/settings-nav.tsx:28`, `plans/plans-view.tsx:87`,
  `cards/cards-view.tsx:49`, `cards/card-tile.tsx:53,103`, `dashboard/summary-card.tsx:51`,
  `dashboard/spend-donut.tsx:135`, `transactions/search-box.tsx:178`, `transactions/period-kpis.tsx:71,127`,
  `transactions/txn-list.tsx:126`, `notifications/notification-panel.tsx:158`
- Arbitrary sizes: `cards/card-tile.tsx:115` (10px), `notifications/bell.tsx:42` (10px, semibold),
  `notifications/notification-panel.tsx:232` (11px). Note: plan said `notification-bell.tsx`, file is `bell.tsx`.
- `.card-title` Bricolage Grotesque weight 700 on 10 headings (`globals.css:226`); display font loads 600/700/800 (`layout.tsx:11`).
- `font-semibold` x2 (one is `bell.tsx:42`).
- Money formats mix: `$3,616` / `$1,925.00` / `$5,000` / `~$2K` / `+$6.7K` on one dashboard.

## Color and surfaces
- Purple `--plan` token (`globals.css:20-23,48-50,76-78`), used at `calendar-card.tsx:50,250,261,264`,
  `ledger-item.tsx:62,81`. Purple `--c7` in chart palette (`globals.css:27,54`).
- Dashboard calendar heat ramp is saturated red/orange/purple/green tiles (strong in dark). Trend bars saturated green plus red.
- Delta chips (green/red tinted pills) on every KPI.
- `Toaster theme="dark"` (`layout.tsx:38`), `themeColor: "#050506"` (`layout.tsx:20`): ignore light theme.
- Duplicated `system` theme block (`globals.css:60-90`).

## Icons
- Sparkles x4: `shell/nav.ts:8` (Insights), `insights/analysis-panel.tsx:54`, `ai/smart-add.tsx:35`, `ai/tidy-panels.tsx:56`.
- Wand2: `settings/nav.ts:41`, `notifications/notification-panel.tsx:24,53`. Bot: `settings/nav.ts:32`, `notification-panel.tsx:10,54`.
- Icon sizes vary (12, 15, 18 seen).

## Spacing
- Arbitrary: `settings/ai/usage/page.tsx:94,148,220`, `trips/[id]/page.tsx:90`, `charts/trend-bars.tsx:98`,
  `ui/sheet.tsx:64` (w-[420px], ml-28), `calendar-card.tsx:239` (4.5rem), `bell.tsx:42`.
- 9 uniform `p-5` cards, each with a card title. Dashboard grid is mostly equal-weight cards.

## Copy
- "Welcome back" greeting `(auth)/login/page.tsx:14`; sub line "Sign in to see your spending." has period.
- Nav label split: desktop "Transactions", mobile "Activity" (`shell/app-shell.tsx:135`).
- Trailing periods on short strings: `(app)/page.tsx:225`, `insights/page.tsx:125`, `settings/page.tsx:9`,
  `trips/[id]/page.tsx:84,108,113`, `merchants-editor.tsx:55`, `import-card.tsx:85,137`, `categories-editor.tsx:234`,
  `ledger-list.tsx:7`.
- Title Case button: "Add New Transaction" (dashboard header).
- No exclamation marks, no hype words, no emoji found.

## Components and layout
- Radius: 85 `rounded-full`, 56 `rounded-2xl`, 10 `rounded-3xl`, 6 `rounded-[28px]`. Pill buttons (`ui/button.tsx:32`),
  pill segmented tabs, pill month stepper (`insights/page.tsx:90`).
- Floating 80px icon-only rail (`shell/app-shell.tsx`), labels only via hover `SideTip` (`:141-145`).
- Mobile "+" raised: `-mt-6`, `shadow-lg shadow-accent/30` (`app-shell.tsx:93`); tab bar `backdrop-blur` (`:84`).
- Settings home is a grid of 64px round icon buttons with hover lift (`settings/settings-grid.tsx:33`).
- `Insight` callouts on 5 pages (`insights/page.tsx:108`, `items/page.tsx:125`, `transactions/page.tsx:160`,
  `trips/[id]/page.tsx:105`, `ai/usage/page.tsx:63`).
- Dashboard: 4 equal KPI cells with progress bars, then calendar + donut + bars of similar weight. No single dominant chart.
- Missing: `error.tsx`, `loading.tsx`, `not-found.tsx`, `global-error.tsx`. 404 currently the framework default.

## Details
- Shadows: `shadow-2xl` sheet (`ui/sheet.tsx:64`), `shadow-xl` on 9 popovers, `shadow-lg shadow-accent/30` (`app-shell.tsx:93`),
  `shadow-md` hover (`settings-grid.tsx:33`, `calendar-card.tsx:240`).
- `blur(2px)` dialog backdrop (`globals.css:181`).
- Hover lift: `hover:-translate-y-0.5` (`calendar-card.tsx:240`, `settings-grid.tsx:33`).

## Motion
- `animate-pulse` x4: `insights/ask-card.tsx:59`, `transactions/transaction-sheet.tsx:313`,
  `ai/receipt-flow.tsx:104`, `notifications/notification-panel.tsx:106`. Plan said 3, there are 4.
- `transition-all` `dashboard/spend-donut.tsx:105`. Bare `transition` shorthand: 20+ sites (`ui/button.tsx:32`,
  `ui/field.tsx:6`, `app-shell.tsx:54`, `ledger-item.tsx:30,54`, etc.).

## Screenshot-only findings (not visible in code greps)
- Dashboard dark: heavy 700-weight display headings, saturated heat tiles, big green bars, delta pills; the page has no single bright element.
- Cards tab: card is a flat list, not a payment-card object. Health chips ("Good", "Paid") are pastel pills.
- Add-transaction sheet: spec line "AI fills the form" under the input; sparkle icon; Fill button is a grey pill.
- Capture artifacts, not app bugs: full-page shots put the mobile tab bar mid-page, the Next dev "N" badge shows on every shot.

## Unverifiable or checkable claims in copy (need your confirmation)
- `settings/ai/page.tsx:53-54`, `settings/ai/usage/page.tsx:28`: privacy claims ("Never individual transactions or notes", "only counts and timings are kept, never what was sent or answered").
- `lib/help.tsx:137`: "limited per month to keep costs…".
Both are behaviour claims, true only if the code does exactly this. I will keep the wording but remove marketing framing unless you say to cut them.

## Repo hygiene
- `package.json` has a stray `playwright@^1.65.1` devDependency. `@playwright/test` is 1.63.0 and its browsers (1243) are what is installed. Mismatch. Review separately; `unslop/shoot.mjs` imports `@playwright/test`.
