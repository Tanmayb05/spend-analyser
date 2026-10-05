# Spend Analyser — Plan & Status

## Status (2026-10-05)

Phases 0–13 are built and running locally. Verified:
- **Unit tests:** 29 (Vitest).
- **Database tests:** 40 (pgTAP).
- **End-to-end:** 11 Playwright scenarios on iPhone and desktop viewports.
- **Builds:** lint, typecheck and production build are clean.

Import parity: the real workbook imports with all 18 months matching Excel to the cent (cash mode, trips counted as each expense).

**Not yet done or verified**
- **Gemini flows** (text entry, receipts, deep analysis) need `GEMINI_API_KEY`. The code paths are written and the quota is tested in SQL, but nothing has run against the live API yet.
- **Deployment:** not deployed. A Supabase project and Vercel env vars are required (see README).
- **Voice entry** uses the browser Web Speech API. It's hidden when the browser doesn't support it, and has no automated test.

**Deviations from the plan below**
- **Framework:** Next.js 16 (`proxy.ts` replaces `middleware.ts`), not 15.
- **Charts:** hand-built SVG/HTML instead of Recharts, so marks follow the validated palette and theme tokens. Categorical palette is slots `c1`–`c8`, colour-blind-validated for both themes.
- **Aggregation:** dashboard and transactions analysis are aggregated in TypeScript (`src/lib/analytics/*`, unit-tested) on top of the SQL `ledger()`, instead of separate `dashboard()` / `explore()` RPCs.
- **UI kit:** a small custom component set instead of shadcn/ui.
- **Number format:** chosen automatically from the currency (INR gives lakh grouping). There's no separate locale override.
- **Receipt uploads** go straight from the browser to Supabase Storage, because Vercel caps request bodies at about 4.5 MB.
- **EMI plans:** the workbook holds 19 distinct plans. Its EMI Tracker sheet lists only 17 (stale).

---

## Context
Turn `Expense_Tracker.xlsx` (Expenses sheet: 419 rows, Jul 2025 → Dec 2026) into an open-source web app built on Next.js, Vercel and Supabase. It's for the owner first, but anyone should be able to self-host it. v1 of the plan lives in `PLAN.md`; this version adds the owner's answers and new requirements:
- "Paid by Friend" rows are already settled: keep `paid_by` as info only, with no balance tracking.
- Open source: MIT license, generic default categories, self-host docs, env-driven keys.
- Drive receipts are shared as "anyone with link", so the app fetches them directly (no Google OAuth).
- AI = **Gemini** (Google key, $300 GCP credits) with **strict usage quotas**.
- **Multi-currency**: USD default, all major currencies including INR, default changeable in Settings.
- **Budgets per category per month**: a month copies last month's budget by default; editing month M applies from M onward.
- **Trips** are excluded from normal spending by default. Each trip can opt in as a lump sum or as itemized expenses.
- **Spread / EMI** any expense over N months so monthly averages stay smooth and future months can be planned.
- **Gemini analysis**, limited runs, results cached.
- **Receipt line items** stored (item, price, qty, date, merchant) for later item-level analysis.
- Month / category / core filtering with **month-on-month analysis** for any filter.
- Main Dashboard and Settings both properly designed.

Priority: **CRUD → Settings → Dashboard/Analysis → Import/Export → AI entry → Receipts/Items → AI insights → Voice**.

---

## 1. Core concept: Transactions vs Ledger
The answers above (trips excluded, spreads, EMIs) require two layers:

- **`transactions`** is what actually happened: one row per purchase, editable in CRUD.
- **Ledger** is what *counts* toward analysis. It's derived in SQL and never edited directly. There are two modes:
  - **Normalized** (dashboard default): spread and EMI plans become monthly installments, so there are no spikes.
  - **Cash**: money leaves on the actual date. A `spread` plan counts as the full amount on the purchase date; an `emi` plan counts each installment as it falls due.

| Transaction kind | Normalized ledger | Cash ledger |
|---|---|---|
| Plain | as-is | as-is |
| Has plan `kind=spread` (paid upfront) | N installments | 1 row, full amount, purchase date |
| Has plan `kind=emi` (paid in installments) | N installments | N installments |
| Trip `include_mode=excluded` (default) | not counted | not counted |
| Trip `itemized` | each trip txn, own category (plans still apply) | same |
| Trip `lump_sum` | 1 synthetic row per trip (sum, chosen date + category), optional spread over N months | 1 row on lump date |

Excluded trip spend still shows up as a chip on the dashboard ("SF Bay trip $1,240 · not counted") so totals don't silently differ from reality.

Row types: `expense` adds, `refund` subtracts, `income` is tracked separately. Future-dated ledger rows are flagged `is_scheduled` and left out of "to date" figures.

---

## 2. Stack
- Next.js 15 (App Router, TS, Server Actions), Tailwind + shadcn/ui, dark theme by default (from `sample_UI.png`), Recharts.
- Supabase: Auth (bcrypt hashing, email confirm, forgot/reset flow), Postgres + RLS, private Storage bucket for receipts.
- `@google/genai` SDK. Models come from env: `GEMINI_MODEL_FAST` (Flash: parsing and receipts) and `GEMINI_MODEL_SMART` (Pro: analysis). Default to the latest Flash/Pro at build time.
  Note: the $300 credits apply to a billing-enabled GCP project, so the AI Studio key must come from that project (or use Vertex).
- FX rates: fawazahmed0 currency-api (free, no key, 150+ currencies, historical by date), cached in an `fx_rates` table.
- SheetJS + Papaparse for import/export; Zod schemas shared by client and server; Vitest + Playwright.
- Open source: `supabase/migrations/*.sql`, `.env.example`, README with a self-host guide and Vercel deploy button, GitHub Actions (lint, typecheck, test), MIT license.

---

## 3. Database schema
All tables have `user_id uuid not null references auth.users on delete cascade` and the RLS policy `user_id = auth.uid()`. The one exception is `fx_rates`, which is global and read-only.

```
profiles(id pk=auth uid, display_name, base_currency char(3)='USD', locale='en-US',
         timezone, week_start smallint=1, theme='dark', date_format,
         dashboard_default_mode ('normalized'|'cash')='normalized',
         default_spread_months int=12, ai_enabled bool=true, onboarded bool)

categories(id, name, kind ('expense'|'income'), is_core bool,      -- core = controllable spend
           color, icon, sort_order, archived bool, description, unique(user_id,name))
subcategories(id, category_id fk cascade, name, archived, unique(category_id,name))

budgets(id, category_id fk, effective_month date /*1st of month*/, amount numeric(12,2) /*base ccy*/,
        unique(user_id, category_id, effective_month))
  -- budget(cat, M) = row with max(effective_month) <= M  → carry-forward is automatic
  -- edit at M: upsert M; then delete rows with effective_month > M (confirm dialog if any exist)
  -- income categories use the same table for an "income target"

payment_methods(id, name, archived)   people(id, name, is_self)
merchants(id, name, default_category_id, default_subcategory_id, unique(user_id, lower(name)))  -- autocomplete + auto-categorize

trips(id, name, start_date, end_date, budget numeric null, currency,
      include_mode ('excluded'|'lump_sum'|'itemized')='excluded',
      lump_date date, lump_category_id, lump_spread_months int null, notes)

transactions(id, date, type ('expense'|'income'|'refund'), category_id, subcategory_id, merchant_id,
             description, amount numeric(14,2) check>0, currency char(3), fx_rate numeric(18,8),
             base_amount numeric(14,2),          -- amount × fx_rate, in profile.base_currency
             payment_method_id, paid_by_id, trip_id, receipt_id, notes,
             source ('manual'|'text'|'receipt'|'voice'|'import'), created_at, updated_at)
  idx (user_id,date desc), (user_id,category_id,date), (user_id,trip_id)

spread_plans(id, transaction_id unique fk cascade, kind ('spread'|'emi'),
             months int>0, installment_amount numeric, start_month date, interest numeric default 0)
installments(id, plan_id fk cascade, seq int, due_date date, amount_base numeric)
  -- generated server-side; amount = round(total/N, 2), last row absorbs the rounding remainder
  -- user enters either months or per-month amount; the other is computed

receipts(id, source_url, storage_path, file_name, mime, sha256 unique per user,
         status ('pending'|'parsed'|'failed'), merchant_name, purchased_at, currency,
         subtotal, tax, discount, total, extracted jsonb, error)
receipt_items(id, receipt_id fk cascade, transaction_id fk null, line_no, raw_name,
              normalized_name, item_category, quantity numeric, unit, unit_price, total_price,
              purchased_at date, merchant_id)       -- idx (user_id, normalized_name, purchased_at)

fx_rates(date, base, quote, rate, pk(date,base,quote))    -- global cache
ai_usage(id, feature ('analysis'|'parse_text'|'parse_receipt'|'transcribe'), tokens_in, tokens_out, created_at)
ai_insights(id, scope_key text, scope jsonb, result jsonb, model, created_at)   -- cache
```

**SQL functions** (`security invoker`, so RLS applies):
- `ledger(p_mode, p_from, p_to)` returns a set of `(entry_date, month, type, category_id, subcategory_id, merchant_id, trip_id, txn_id, label, signed_base, is_core, is_scheduled, installment_seq, installment_total)`. This is the union described in §1 and the single source for every analysis.
- `budgets_for(p_month)` returns the per-category budget resolved by carry-forward.
- `dashboard(p_month, p_mode)` returns JSON for every dashboard card in one round trip, which keeps mobile fast.
- `explore(p_filters jsonb, p_mode)` returns the total, a page of ledger rows, a 12-month MoM series, and subcategory/merchant breakdowns for the same filter.
- `consume_ai_quota(p_feature)`: atomically checks the monthly limit and inserts a usage row; raises an error if over the limit.

**Signup trigger:** creates `profiles`, seeds generic categories and subcategories with `is_core` flags, budgets of 0, common payment methods, and a "Me" person.

---

## 4. Main Dashboard (`/app`)
**Header:** month picker `‹ Oct 2026 ›` · mode toggle **Normalized | Cash** · scope toggle **All | Core**. Every card follows the header.
Card rule: title phrased as a plain question, **one big number**, at most one simple chart, and **one insight sentence**.

**Row 1: KPI tiles** (2-col grid on mobile, 5-col on desktop; big numbers; delta chip vs last month)
1. **Spent**: total, plus a thin bar showing % of total budget.
2. **Income**: total vs income target.
3. **Net saved**: income − spent, plus savings rate. Green if positive, red if negative.
4. **Core spend**: total vs core budget. The headline controllable number.
5. **Left per day**: (budget − spent) / days left. For past months it shows **Avg per day** instead.

**Row 2**
- **"Am I spending more than I earn?"**: last 12 months of paired bars (spent vs income). The selected month is highlighted blue; clicking a bar changes the month. Insight: "Spent more than earned in 9 of 12 months."
- **Calendar** (as in the sample): dots on days with spending. Tapping a day shows its total and entries. The big number below is the selected day/week total.

**Row 3**
- **"Where did it go?"**: donut of the top 5 categories + Other, with the total in the centre. Clicking a slice opens Transactions filtered to it. Insight names the biggest *core* category.
- **"Which budgets need attention?"**: one progress bar per category, sorted worst first, labelled On track / Near limit (≥80%) / Over.
- **"What's coming up?"**: installments and scheduled rows in the next 30 days (Invoices-style list), plus "Committed next month: $X".

**Row 4**
- **"Can I afford next months?"**: for each of the next 3 months, committed installments vs budget as a simple bar per month. Supports planning ahead.
- **Trips this month**: trip spend plus its include mode ("not counted" chip). Links to the trip.
- **Insights**: 3 rule-based sentences that are always free (below), plus a **"Deep analysis (Gemini)"** button showing "2 of 5 left this month" and the cached result with its generated-on date.
- **Recent transactions**: last 5, plus "View all".

**Rule-based insights** (deterministic, computed in TypeScript from `dashboard()` output):
- Category > 120% of its 3-month average
- A single expense > 25% of its category budget
- Savings rate change of ±10 points
- Core spend pace projects over budget by month end
- An EMI finishing this month frees $X/month
- A new merchant with spend > $50
- Income below target

---

## 5. Transactions + Analysis (`/app/transactions`). The CRUD hub
One page covers both "show all transactions for a month" and "month-on-month analysis for the selected filter".
- **Filter bar** (state in URL query params, so it's shareable and works with back/forward):
  - Month or range · Type · Category (multi) · Subcategory · **Core only** · Trip · Merchant · Payment · Paid by · Has receipt · Spread/EMI · text search.
  - Saved filters are a later nice-to-have.
- **Summary strip:** big total for the filter, entry count, and % change vs previous month and vs 3-month average.
- **MoM chart:** 12 bars for the same filter with an average line. Collapsible on mobile. Clicking a bar jumps to that month.
- **Breakdown chips:** top subcategories and top merchants for the filter.
- **List follows the mode** so the list sum always equals the big total.
  - Cash shows raw rows.
  - Normalized shows ledger rows, e.g. "Laptop · 3 of 12 · $100".
  - Tapping any row edits the parent transaction.
- **CRUD:**
  - Desktop: table with row actions and bulk select/delete.
  - Mobile: rows grouped by day, tap to open the edit bottom sheet, swipe to delete, undo toast.
  - Duplicate action for repeating entries.
  - Optimistic updates via Server Actions.
- **Form:**
  - Required: Date · Type · **Amount + currency** (defaults to base; non-base currency shows the converted amount and the rate can be overridden) · Category → Subcategory · Merchant (autocomplete; picking a merchant pre-fills its default category).
  - Optional: Description · Payment · Paid by · Trip · Receipt.
  - **"Spread this cost"** toggle: kind (Paid upfront → spread / Paying in installments → EMI), months ↔ per-month amount, start month. Live preview: "$1,200 → $100/mo · Oct 2026 – Sep 2027".

---

## 6. Other pages
- **Trips** (`/app/trips`): list cards showing total, per day, budget used, and include-mode badge.
  - Detail page: subcategory breakdown bar, transactions, and an include-mode switch: Excluded / Count as one lump sum (date, category, optional spread months) / Count each expense.
  - "Add expense" is pre-tagged with the trip.
- **Plans** (`/app/plans`): all spread/EMI plans with progress bar, paid, remaining and next due, plus a 12-month committed-spend outlook.
- **Items** (`/app/items`, from receipts): search an item to see its purchase history (date, merchant, qty, unit price), last bought date, and a simple price-over-time line. v1 is a basic version; deeper analysis comes later.
- **Insights** (`/app/insights`): Gemini deep analysis.
  - Scopes: this month, last 3 months, or a year. Results are cached per `scope_key` and show "Regenerate (N left)".
  - Input is **aggregates only** (monthly category totals, budgets, top merchants, item price changes), never raw rows. That keeps tokens cheap and data private.
  - Output is structured JSON: summary, 3–5 insights {title, detail, metric, severity}, 3 actions.
- **Add** (＋ button, bottom sheet): text box ("12.5 kroger groceries yesterday" → Gemini Flash → pre-filled form → confirm), receipt upload / Drive link, mic (Web Speech API; hidden if unsupported), or the manual form.

### Receipt flow
1. If given a Drive link, extract the file ID and fetch `drive.google.com/uc?export=download&id=…`.
   - Host allowlist: `drive.google.com`, `docs.google.com`, `drive.usercontent.google.com`.
   - 10 MB cap; mime sniffing for pdf, png, jpg, webp and heic.
2. Hash with sha256 to dedupe, store in the private bucket, and create a `receipts` row.
3. Gemini Flash (native PDF/image input, JSON schema output) returns merchant, date, currency, subtotal, tax, discount, total, and items (raw name, normalized name, item category, qty, unit, unit price, line total).
4. Review screen: editable item table plus a warning if the item sum doesn't match the total. The user chooses **one transaction** or **split by category** (items grouped; tax allocated pro-rata).
5. Save the transactions and `receipt_items` linked to them. The receipt file opens from the transaction via a signed URL.

### AI quotas (cost control)
Every Gemini call goes through `consume_ai_quota()`.

| Env var | Default | Limit |
|---|---|---|
| `AI_LIMIT_ANALYSIS` | 5 | analyses per user per month |
| `AI_LIMIT_PARSE` | 100 | text + receipt parses per user per month |
| `AI_GLOBAL_DAILY_LIMIT` | 300 | all calls per day, instance-wide |

Remaining quota is shown in the UI and in Settings → AI. Analysis results are cached, so repeat views cost nothing.

---

## 7. Settings (`/app/settings`, left sub-nav on desktop / list on mobile)
| Section | Contents |
|---|---|
| **Profile** | name, email (change → confirm email) |
| **Security** | change password, sign out all devices, delete account (type-to-confirm, cascades everything incl. storage) |
| **Preferences** | **default currency** (searchable list of all ISO currencies; changing it recomputes `base_amount` for all transactions from historical rates, and asks whether to convert budgets at today's rate), number format/locale (en-IN gives ₹1,00,000 lakh grouping), date format, week start, timezone, theme, default dashboard mode (Normalized/Cash), default spread months |
| **Categories** | CRUD, drag reorder, color/icon, **Core toggle**, expense/income kind, archive. Deleting a used category opens a dialog to reassign or merge into another. Subcategories inline under each category. |
| **Budgets** | month picker + table: category · budget · "set since Mar 2026" · last month actual. Editing shows "Applies from Oct 2026 onward" (confirm if later overrides get replaced). Totals row: total budget, core budget, income target. History drawer per category showing its effective-dated changes. |
| **Payment methods / People** | simple lists with CRUD and archive |
| **Merchants** | rename, merge duplicates, default category/subcategory (drives auto-categorize) |
| **AI** | enable/disable, usage this month per feature vs limits, what data is sent |
| **Data** | import Expense_Tracker workbook, import CSV/XLSX (column mapping + preview + dedupe), export filtered or full (CSV, XLSX in original column order, JSON backup), delete all transactions |

---

## 8. Import (workbook migration)
- **Settings sheet:** categories (Rent/Education/Travel get `is_core=false`, everything else `true`), budgets (one row effective 2025-07), subcategories, trips, payment methods, people.
- **Expenses sheet:**
  - Rows with `(plan $X / N)` or `"… EMI k"` are grouped into one parent transaction (total X, first installment date) plus a `spread_plan(kind='emi')` whose installments use the actual row dates and amounts.
  - Receipt filenames are kept in `receipts.file_name` with status `pending` so files can be attached later.
- **Imported trips:** the default is `include_mode='itemized'` so totals match Excel. An import option offers "excluded" instead.
- **Preview before commit:** counts, unmatched categories, errors.

---

## 9. Phases (each ends deployable)
| # | Deliverable |
|---|---|
| 0 | Repo: Next.js scaffold, Tailwind/shadcn dark tokens, app shell (sidebar + mobile bottom nav: Overview · Transactions · ＋ · Trips · More), MIT/README/.env.example, CI, Vercel link |
| 1 | Auth: signup, signin, forgot/reset, signout, middleware guard |
| 2 | Migrations: all tables, RLS, signup seed, `budgets_for`, `ledger`, `consume_ai_quota`; SQL tests |
| 3 | Settings core: preferences, categories/subcategories, **budgets (effective-dated)**, payment methods, people, merchants |
| 4 | **Transactions CRUD** + multi-currency + FX cache + spread/EMI in the form |
| 5 | Workbook importer → verify totals |
| 6 | Transactions filters + summary + MoM analysis (`explore`) |
| 7 | Dashboard (`dashboard()` + cards + rule insights) |
| 8 | Trips (modes, lump sum) + Plans page |
| 9 | Export + generic import |
| 10 | Gemini infra + quotas + text quick-add |
| 11 | Receipts (upload + Drive) + `receipt_items` + Items page |
| 12 | Gemini deep analysis + cache + Insights page |
| 13 | Voice, PWA manifest, Playwright e2e, production deploy, update `PLAN.md` |

Key files:
- `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`
- `src/lib/ledger.ts` (types), `src/lib/money.ts` (Intl formatting, FX), `src/lib/installments.ts` (schedule generation)
- `src/lib/insights/rules.ts`, `src/lib/ai/gemini.ts`, `src/lib/import/workbook.ts`
- `src/app/(app)/{page,transactions,trips,plans,items,insights,settings}/…`
- `src/components/cards/*` (KpiTile, TrendBars, Donut, BudgetBars, UpcomingList, Calendar)

---

## 10. Verification
- **Unit (Vitest):**
  - installment generation (rounding remainder, months ↔ amount)
  - budget carry-forward resolution
  - FX conversion
  - workbook EMI regex grouping
  - rule insights
  - Gemini response Zod parsing (with fixtures)
- **SQL tests** against local Supabase (`supabase start`):
  - `ledger()` for each row kind in both modes
  - trips excluded / lump / itemized
  - RLS: a second user sees 0 rows
  - quota RPC rejects after the limit
- **Import parity:** after importing the workbook, Cash mode with trips itemized must match the Excel Monthly Summary exactly: 2026-09 spent $1,882.19 / income $901.14; 2026-01 $1,832.82 / $764.15; to-date total $26,660, income $7,997.
- **E2E (Playwright, iPhone + desktop viewports):**
  - signup → confirm → login → add / edit / delete transaction
  - spread a $1,200 expense over 12 months and check the dashboard shows $100/mo
  - set the Oct budget, check Nov inherits it, change Dec, check Oct and Nov are unchanged
  - add a trip, check it's excluded, switch to lump sum, check it's counted
  - forgot-password email flow (Supabase Inbucket locally)
- **Manual:** parse a real Kroger PDF from a Drive link → items stored → Items page shows the history. Lighthouse mobile ≥ 90.
