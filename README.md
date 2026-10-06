# Spend Analyser

A personal finance app that turns an expense spreadsheet into a fast, mobile-friendly dashboard.
Track expenses and income, plan budgets month by month, spread big purchases over time, keep trips separate,
and read receipts with AI. Open source (MIT), self-hostable on **Vercel + Supabase**.

## Features

- **Simple CRUD**: add, edit, duplicate and delete transactions in a few taps. Bulk delete with undo.
- **Dashboard**: big numbers and simple charts. Every card answers one question in plain words.
  - Spent, income, net saved, core spend, left per day
  - 12-month spend vs income, calendar, where the money went, budget health, what's coming up, next-months outlook
- **Normalized vs cash views**: spread or EMI costs show as smooth monthly amounts (normalized) or on the day the money left (cash).
- **Core spending**: mark categories as core (everyday, controllable) or fixed (rent, tuition), and filter any view to core only.
- **Budgets per category per month**: each month carries forward the last budget you set. Changing a month applies from that month onward.
- **Trips**: kept out of monthly spending by default. Count a trip as one lump sum (optionally spread over months) or as each expense.
- **Spread / EMI** any expense over N months, by months or by a per-month amount. Future months show what's already committed.
- **Transactions analysis**: filter by month, category, subcategory, core, trip, merchant, payment, person or text, with a month-on-month chart for the same filter.
- **Multi-currency**: 120+ currencies. Each transaction keeps its original amount and the day's exchange rate. Change the default currency any time and everything is converted. INR uses lakh grouping (₹1,00,000).
- **Import / export**: imports the Expense Tracker workbook (or any CSV/XLSX with Date, Type, Category, Amount columns). Exports Excel/CSV in the same columns (re-importable) and a full JSON backup.
- **AI with Gemini** (optional, quota-limited):
  - "12.50 kroger groceries yesterday", typed or spoken, becomes a pre-filled transaction
  - Receipts (PDF, photo or public Google Drive link) are read, split by category, and every line item is stored
  - Items page: what you bought, when, where, and how the price changed
  - Deep analysis of your monthly totals, cached so repeat views are free
- **Accounts**: sign up, email confirmation, sign in, forgot/reset password, change email/password, sign out everywhere, delete account. Passwords are hashed by Supabase Auth (bcrypt); the app never sees them.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + RLS, Auth, Storage) · Gemini (`@google/genai`) · SheetJS · Vitest · Playwright · pgTAP

All money logic lives in Postgres so every client gets the same answers. That includes the `ledger()` function, installment schedules, carry-forward budgets, atomic imports and AI quotas. Every table uses row-level security plus composite foreign keys, so one user can never reference another user's rows.

## Run locally

Requirements: Node 22+, Docker (or Colima), npm.

```bash
npm install
npx supabase start          # local Postgres, Auth, Storage, Mailpit
cp .env.example .env.local  # paste the keys printed by `supabase start`
npm run dev                 # http://localhost:3000
```

Sign-up confirmation and password-reset emails land in Mailpit at http://127.0.0.1:54324.

Optional: set `GEMINI_API_KEY` in `.env.local` to enable AI features.

## Deploy (Supabase + Vercel)

1. **Supabase**: create a project, then push the schema:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   In **Authentication → URL Configuration**, set *Site URL* to your Vercel URL and add `https://<your-domain>/**` to *Redirect URLs*.
   In **Authentication → Providers → Email**, keep *Confirm email* on. For real use, set up custom SMTP: the built-in mailer only sends a few emails per hour.
   Install the email templates from `supabase/templates/` (**Authentication → Emails**, or `npx supabase config push` with a `[remotes.<name>]` block for your project). They link to `/auth/confirm?token_hash=…`, so confirmation and password-reset links work on any device, not only in the browser that asked for them.
2. **Gemini** (optional): create an API key in Google AI Studio from a GCP project with billing enabled (GCP credits apply).
3. **Vercel**: import the repo and add the environment variables from `.env.example`:

   | Variable | Notes |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API |
   | `SUPABASE_SECRET_KEY` | **server only**; used for account deletion, AI quota and the FX cache |
   | `NEXT_PUBLIC_SITE_URL` | your deployment URL (used in email links) |
   | `GEMINI_API_KEY`, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_SMART` | optional |
   | `AI_LIMIT_ANALYSIS`, `AI_LIMIT_PARSE`, `AI_GLOBAL_DAILY_LIMIT` | monthly per-user limits and an instance-wide daily cap |

## How the numbers work

- **Spent** = expenses − refunds. Income is tracked separately. **Net saved** = income − spent.
- **Core spend** = spending in categories marked *Core*.
- **Future-dated rows** (scheduled payments, upcoming installments) don't count in "to date" figures until their date arrives. Future months show them as *committed*.
- **Normalized vs cash**:

  | | Normalized | Cash |
  |---|---|---|
  | Spread (paid upfront) | one installment per month | full amount on the purchase date |
  | EMI (paid in installments) | per installment | per installment |
  | Trip, *not counted* | ignored | ignored |
  | Trip, *each expense* | counted normally | counted normally |
  | Trip, *lump sum* | one entry, optionally spread over months | one entry |

- **Budget status**: *Over* above 100%, *Near limit* at 80% or more, otherwise *On track*.

## Tests

```bash
npm test            # unit tests (analytics, budgets, installments, importer, receipts)
npm run test:db     # pgTAP: ledger modes, trips, budgets, RLS isolation, quotas, import, currency rebase
npm run test:e2e    # Playwright on iPhone + desktop: auth, CRUD, import parity, every page, budgets, trips, export, currency
```

If `Expense_Tracker.xlsx` is in the repo root, the import tests check that every month matches the spreadsheet to the cent. The workbook is git-ignored: keep personal data out of the repo.

## Privacy

- Nothing goes to Gemini unless you press a button. Deep analysis only sends monthly totals, never individual transactions or notes.
- Receipt files are stored in a private bucket, reachable only by their owner through short-lived signed links.
- Drive links are fetched only from Google hosts (redirects are re-checked), capped at 10 MB, and file types are verified by content.

## License

MIT
