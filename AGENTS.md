<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# UI style (from the unslop pass; follow for all new UI)

Character: calm, exact, plain-spoken. Ledger look: ink figures, hairline rules, paper-neutral surfaces.

- **Tokens only, no raw values.** Colors come from `globals.css` (`light-dark()` pairs): `bg`, `surface`/`-2`/`-3`, `border` (hairline), `text`/`muted`/`faint`, one `accent`, toned `good`/`warn`/`bad`. No purple, gradients, glows or gradient text. Chart colors `--c1`..`--c8`; neutrals `--chart-n1/n2`, `--chart-muted`.
- **Radius:** `rounded-control` (10, buttons/inputs/rows), `rounded-inset` (8, block inside a card), `rounded-card` (16), `rounded-panel` (20, sheets/drawers). Inner radius = outer minus padding. `rounded-full` only for status chips, dots, avatars. No `rounded-2xl/3xl/[28px]`.
- **Spacing (4px grid):** `p-compact` 16, `p-card` 20, `p-card-lg` 24, `px-page` 24, `px-page-lg` 32. No uneven one-off padding.
- **Type:** scale xs 12 to 3xl 32, no arbitrary `text-[Npx]`. Labels use `text-label` (sentence case), never `uppercase tracking-wide`. `.card-title` is Bricolage 500.
- **Money figures (signature):** `money` (Geist Mono, tabular, right-aligned) for row amounts, table cells and small figures. Display size (text-xl and up: KPIs, donut centre, totals) uses `num-lg` (Geist Sans, tabular). Money only.
- **Icons:** Lucide, size 16 or 18, stroke 1.5 (set globally). No Sparkles/Wand2/Bot decoration, no emoji labels, no "New" badges.
- **Details:** only `shadow-pop` for floating things (no `shadow-lg/xl/2xl`, no colored shadows). Dialog scrim flat `rgb(0 0 0 / 0.5)`, no blur. Selected/active = `bg-surface-3 ring-1 ring-inset ring-text/10`, not an inverted fill. Focus ring is global `:focus-visible`.
- **Motion:** easing `--ease-ui`; durations `--dur-fast` 150, `--dur-base` 200, `--dur-slow` 320. Name transitioned properties (no bare `transition`, no `transition-all`). No `animate-pulse`/pulsing; skeletons are static.
- **Layout:** labeled 240px sidebar on desktop, bottom tab bar on mobile (flat `bg-surface`). Nav label is "Transactions". Don't give every block a card; use ruled lists/strips (`cards/stat-strip.tsx`) instead of rows of stat cards.
- **Copy:** plain and specific, no marketing framing, no trailing periods on short UI strings. Keep factual privacy claims as the code makes them.
- **Theme:** respect light/dark/system via `src/lib/theme.ts`; never hard-code dark (`Toaster`, `themeColor`).
- **Tailwind merge:** custom tokens are registered in `cn()` (`src/lib/utils.ts`); add new spacing/radius tokens there too.

# App lifecycle: "start app" / "stop app"

When the user says **start app** or **stop app**, do all of the steps below, in order, without asking. Local only; never touches hosted Supabase or Vercel.

**Stop app** (stop everything this app runs):
1. Dev server: `lsof -nP -iTCP:3000 -sTCP:LISTEN`, then `kill` the `next dev` and `next-server` PIDs.
2. Local database: `npx supabase stop --project-id spend-analyser`. This removes the containers but keeps the data volumes and a backup, so data survives.
3. Colima: `colima stop`.

**Start app** (bring everything back):
1. Colima: `colima start` if `docker ps` fails.
2. Local database: `SUPABASE_PROJECT_ID=spend-analyser npx supabase start`. The env var is required: `.env.local` holds the hosted project ref, and without the override the CLI creates a second, empty stack named after the hosted ref (`*_gehuvxvbrcqqpvxwatgh`, different keys, no data). The correct stack is the one named `*_spend-analyser`; it restores the local data. If the wrong stack is running by mistake, stop its containers first (`docker stop` the `*_gehuvxvbrcqqpvxwatgh` ones).
3. Check it is healthy: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:54321/auth/v1/health` returns 200, and `docker ps` shows `*_spend-analyser` containers.
4. Dev server: `npm run dev` in the background (http://localhost:3000). Skip if port 3000 is already listening.
5. Report what is running and the URL. Never print `.env.local` values.
