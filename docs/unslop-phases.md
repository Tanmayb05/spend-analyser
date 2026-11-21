# Unslop plan: phased polish of the whole site

Applies the `unslop:unslop` skill (created by Damir Sokolovsky, [@heydamir](https://x.com/heydamir), CC BY 4.0) to every screen of Spend Analyser.

## Goal and mode

The audit found the app is already **light slop**: no gradients, no gradient text, no emoji, no purple Tailwind classes. So this runs in **polish mode**. Fix what the audit found, keep the existing palette, fonts and section order, and do not invent a new brand.

What the audit did find:

- 20 `uppercase tracking-wide` labels
- Pill and oversized-radius shape language: 85 `rounded-full`, 56 `rounded-2xl`, 10 `rounded-3xl`, 6 `rounded-[28px]`
- 7 Sparkles/Wand2 icons and 1 Bot icon
- 3 `animate-pulse`
- `shadow-lg shadow-accent/30` on the mobile "+" button
- Floating icon-only sidebar that depends on hover tooltips
- 3 arbitrary font sizes (`text-[10px]`, `text-[11px]`)
- Purple `--plan` token for EMIs and plans
- Uniform `p-5` cards with a `.card-title` on every one
- `Toaster theme="dark"` and `themeColor` hard-coded, ignoring the light theme
- Duplicated `system` theme block in `globals.css`
- No `error.tsx`, `loading.tsx`, `not-found.tsx` or `global-error.tsx`

### Decisions already made

- **Sidebar:** replace the floating 80px icon rail with a labeled sidebar of about 240px.
- **Radius:** tighten. Controls 8 to 10px, cards 12 to 16px, panels 14 to 20px, with nested-radius math. Pills only for tiny status chips.
- **Story video:** not produced.

## Rules for every phase

- **Local only.** Verify against local Supabase. Never commit, push, deploy or touch hosted Supabase or Vercel (see `CLAUDE.md`).
- **Leave the tree uncommitted** so the diff can be reviewed.
- **No migrations.** None of these phases touch the schema.
- **Update e2e selectors in the same phase** as any copy or label change. Specs in `tests/e2e` select by text.
- **Per-phase loop:**
  1. Screenshot before.
  2. Audit against the skill's `signs.md`.
  3. Fix in the skill's nine-pass order: spacing, color, icons, copy, type, layout, details, visuals, motion.
  4. Screenshot after.
  5. Run the checks below.
  6. Report: what changed, which localhost URL to open and what to click.
- **Checks:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` (both `mobile` and `desktop` projects), plus a grep for leftover tells. CI does not run Playwright, so e2e must be run locally.

## Phase 0: Baseline and direction (gate, no code edits)

- Write a Playwright script (Playwright is already a devDependency) that screenshots every route on mobile (iPhone 14) and desktop (1440x900), in dark and light, into `unslop/before/`. Keep screenshots out of commits.
- Record the audit, one line per sign with `file:line`, in `unslop/audit.md`.
- Save the approved direction to `unslop/direction.md` (needed after compaction, see "Where to compact").
- Draft direction, which **must be confirmed before Phase 1**:
  - **Product:** personal spend tracker that turns a spreadsheet and receipts into monthly spend, cards, EMIs and trips.
  - **Character:** calm, exact, plain-spoken.
  - **World:** the household ledger and the bank statement. Ink figures, hairline rules.
  - **Moments:** the spend donut and trend/net bars on the dashboard; payment-card tiles in the Cards tab, built in code.
  - **Signature:** ruled-ledger numerals. Tabular mono figures aligned right with hairline row rules, used on money amounts only.
- Ask about any unverifiable claims in copy.

## Phase 1: Foundations (tokens and primitives)

Files: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/{button,card,badge,field,segmented,sheet,empty,info-title}.tsx`, `src/components/charts/colors.ts`.

- **Spacing:** 4px scale. Padding tokens: compact 16, card 20 to 24, page 24 to 32.
- **Color:** one neutral ramp with three text roles, one accent (`--accent`). Fold the purple `--plan` into a neutral-plus-accent or a quiet status tone. Keep semantic good/warn/bad toned down. Keep the validated colour-blind chart palette `--c1` to `--c8`; only review the purple `--c7`.
- **Theme plumbing:** remove the duplicated `system` block in `globals.css`. Make the `Toaster` theme and `themeColor` follow the active theme.
- **Type:** remove `text-[10px]` and `text-[11px]` (`card-tile.tsx:115`, `notification-bell.tsx:42`, `notification-panel.tsx:232`). Weights 400 and 500, 600 at most. Add a sentence-case label utility to replace `uppercase tracking-wide`. Keep `.num` tabular. Review `.card-title` (Bricolage, 700) down to 500.
- **Details:** radius tokens `--radius-control` 10, `--radius-card` 16, `--radius-panel` 20. Button leaves `rounded-full`. Segmented, Sheet and Card use nested-radius math. Quiet hairline borders, visible focus ring. Remove `shadow-2xl` on the sheet and the `blur(2px)` dialog backdrop.
- **Motion:** one easing curve and three durations. Replace the bare `transition` shorthand with named properties.
- **Exit criterion:** later phases consume tokens and use no raw values. Review this phase locally before continuing, because the radius change shifts every screen.
- Write the chosen token names and values to `unslop/decisions.md`, then **compact** (point 2).

## Phase 2: App shell, navigation, notifications

Files: `src/components/shell/{app-shell.tsx,nav.ts}`, `src/components/notifications/{notification-bell,notification-panel,notifications-provider}.tsx`, `src/components/logo.tsx`.

- **Layout:** labeled sidebar of about 240px. Logo and name on top; nav rows 32 to 36px tall with 2 to 4px gaps; icons in one column, labels on one line; add button, bell and sign-out in the footer. Content capped around 1440 to 1600. Remove the now-redundant `SideTip` tooltips.
- **Mobile:** keep the bottom tab bar. Flatten the "+" button (drop `-mt-6` and `shadow-lg shadow-accent/30`) and drop `backdrop-blur`. Keep the More sheet.
- **Icons:** replace Sparkles on Insights with a plain line icon. One size (16 or 18), 1.5 stroke, text-role color.
- **Copy:** make nav labels consistent. Desktop says "Transactions", mobile says "Activity"; pick one.
- **Notification drawer:** tighter radii, sentence-case section labels (`notification-panel.tsx:158`), fix the 11px text.
- **Logo:** keep the three-bar mark, flat solid color.
- **Check:** measure the sidebar after the pass. Update e2e nav selectors.
- Add sidebar width and the chosen nav labels to `unslop/decisions.md`, then **compact** (point 3) before launching Wave B.

## Phase 3: Dashboard (`/`)

Files: `src/app/(app)/page.tsx`, `src/components/dashboard/*`, `src/components/charts/*`.

- **Layout rhythm:** compact stat row plus one dominant chart. Vary card widths instead of an equal-card grid. One main chart; everything else smaller and different in kind.
- **Stats:** label, figure, and "vs last month". No decorative mini-visuals.
- **Labels:** `summary-card.tsx:51` and `spend-donut.tsx:135` go to sentence case.
- **Charts:** one accent per chart, everything else in neutral steps. Muted grid and mono labels. Keep the calendar heat ramp but quieter.
- **Moment:** the spend donut or trend is the one bright element.
- **Empty and first-run states:** `add-first`, `empty-state`.

## Phase 4: Transactions (Activity, Plans, EMIs, Cards tabs) and the transaction sheet

Files: `src/app/(app)/transactions/page.tsx`, `src/components/transactions/*` (including `transaction-sheet.tsx`, 621 lines), `trend-bars`, `breakdown`.

- **Rows:** one height and gap, money right-aligned and tabular (the signature), hairline rules. Header, selected and focused rows must read apart.
- **Labels:** `txn-list.tsx:126`, `period-kpis.tsx:71,127`, `search-box.tsx:178`.
- **Filter bar and search:** control radius, short labels (`Search`).
- **Tabs:** Segmented becomes a surface step with a hairline, not a pill.
- **Sheet:** spacing and field rhythm; replace `animate-pulse` at `transaction-sheet.tsx:313`.
- **Sub-steps to keep diffs reviewable:** 4a list and filters, 4b KPIs and charts, 4c sheet.

## Phase 5: Cards, Plans, EMIs, Trips, Items

Files: `src/components/{cards,plans,trips}/*`, `src/app/(app)/{trips,items}/**`.

- **Card tile** (`card-tile.tsx:53,103,115`): a payment-card object built in code with real material, flat. This is the Cards tab moment. Fix the 10px text.
- **Plans and EMIs:** replace purple `--plan` usage with a quiet neutral plus accent or status tone. `plans-view.tsx:87` label. `plan-row`.
- **Trips:** list and detail (`trips/[id]/page.tsx:67` label). "New trip" as a normal primary button.
- **Items:** table rhythm; price-line chart with one accent.

## Phase 6: Insights and AI surfaces

Files: `src/app/(app)/insights/page.tsx`, `src/components/insights/*`, `src/components/ai/*`.

- **Sparkles and Wand2** (`analysis-panel.tsx:54`, `smart-add.tsx:35`, `tidy-panels.tsx:56`): plain icon or none. Describe what the feature does instead of "AI-powered" framing.
- **`animate-pulse`** (`ask-card.tsx:59`, `receipt-flow.tsx:104`): static, or real progress text. Keep `animate-spin` only for genuine loading.
- **Month stepper pill** (`insights/page.tsx:90`): control radius.
- **`Insight` callouts:** fewer, quieter, one style.
- **Flags and analysis cards:** clear hierarchy, sentence case.

## Phase 7: Settings (14 pages)

Files: `src/app/(app)/settings/**`, `src/components/settings/*`.

- **Labels:** `settings-nav.tsx:28`, `budgets-editor.tsx:55,63`, `settings/ai/page.tsx:36`, `settings/ai/usage/page.tsx:96,138,150`.
- **Settings home:** replace the equal-card grid with a grouped list, one row height.
- **Forms** (`field.tsx`): label and input rhythm, inline validation copy, no trailing periods.
- **Usage tables:** right-aligned tabular numbers, hairline rules.
- **Bot icon** (`settings/nav.ts:32`): plain line icon.
- **Theme picker** in `preferences-form`: verify light, dark and system after the Phase 1 plumbing fix.

## Phase 8: Auth and system states

Files: `src/app/(auth)/**`, `src/components/auth/auth-form.tsx`, new `src/app/{error,not-found,loading}.tsx` and `global-error.tsx`, `src/components/ui/empty.tsx`.

- **Login:** "Welcome back" greeting becomes the page name ("Log in"). Same pass on signup, forgot password and reset password (reset lives inside the app shell; confirm that is intended).
- **Auth card:** width and rhythm, short labels, one primary action.
- **Missing states:** add `not-found`, `error`, `loading` and `global-error` in the new style, without pulsing skeleton noise.
- **PWA:** `manifest.webmanifest` theme color, flat `icon.svg`.
- **Note:** `AGENTS.md` says this Next.js version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing these files.

## Phase 9: Final sweep and report

- **Grep checklist:** `uppercase tracking`, `rounded-full` (only status dots and avatars should remain), `rounded-3xl`, `animate-pulse`, `shadow-`, `transition-all`, arbitrary `[Npx]` sizes and spacings, `Sparkles|Wand2|Bot`, hex values outside `globals.css`.
- **Full e2e** on both projects, both themes, and with `prefers-reduced-motion`.
- **Compare** after screenshots with `unslop/before/`.
- **Template check:** swap the product name for another product's. If the screen still fits, push the copy and signature harder.
- **Report** per the skill: direction, a few lines per pass, anything left. Everything stays uncommitted.

## Execution model: what can run concurrently

Phases 3 to 8 can run in parallel. Phases 0, 1, 2 and 9 cannot.

### Waves

- **Wave A (sequential, user gate after each):** Phase 0, then Phase 1, then Phase 2. Everything else imports `globals.css`, `components/ui/*` and the shell, so they must be settled first or parallel agents will fight over the same files and build on moving tokens.
- **Wave B (parallel, 4 agents launched in one message, same working tree):**

  | Agent | Owns (writes only here) |
  |---|---|
  | B1 | Phase 3: `src/app/(app)/page.tsx`, `src/components/dashboard/*`, `src/components/charts/*` |
  | B2 | Phase 4 plus the AI components: `src/app/(app)/transactions/**`, `src/components/transactions/*`, `src/components/ai/*` (smart-add and receipt-flow are used inside the transaction sheet, so they belong here, not with Phase 6) |
  | B3 | Phase 5 plus the rest of Phase 6: `src/components/{cards,plans,trips,insights}/*`, `src/app/(app)/{trips,items,insights}/**` |
  | B4 | Phases 7 and 8: `src/app/(app)/settings/**`, `src/components/settings/*`, `src/app/(auth)/**`, `src/components/auth/*`, new `error`, `not-found`, `loading` files |

- **Wave C (sequential):** Phase 9.

### Rules that make parallel work safe

1. **Disjoint file ownership.** Each agent edits only its own row. Shared files (`globals.css`, `components/ui/*`, the shell, `lib/*`) are read-only in Wave B. An agent that needs a token or primitive change returns a "needs shared change" note, and the main thread applies it after the wave.
2. **Same working tree, not git worktrees.** `CLAUDE.md` forbids committing, so Phase 1 and 2 work is uncommitted, and a worktree (branched from HEAD) would not contain the new tokens. Worktrees also lack the gitignored `.env.local` and `node_modules`.
3. **One local stack.** All agents share local Supabase and one `npm run dev` on port 3000. No agent runs `supabase db reset` or starts its own dev server.
4. **No per-agent test runs on a half-edited tree.** `tsc`, `eslint` and Playwright over files other agents are mid-edit would report each other's errors. Agents only screenshot their own routes from the running dev server. The main thread runs `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e` once after all agents return, and sends failures back to the owning agent.
5. **One brief for all agents:** the approved direction, the nine passes in order, their phase section of this doc, the skill checklist. Each returns: files changed, what to click on localhost, shared-change requests, e2e selectors it changed.
6. **Review checkpoint.** After Wave B, review all routes on localhost in one pass before Phase 9.

### Trade-off

Four agents spend tokens at once, and UI changes land on many routes simultaneously, which is harder to review than one phase at a time. For reviewable increments, run Wave B sequentially in the order 3, 4, 5 and 6, then 7 and 8, with the same ownership boundaries.

## Where to compact (`/compact`)

Compact at phase boundaries, after the user has reviewed and the state is written to disk, never mid-phase. A compaction summary loses detail, so anything later phases depend on must live in a file first.

**Write these to disk before the first compact:**
- `unslop/direction.md`: the approved five-line direction (Phase 0 output).
- `unslop/audit.md`: the audit, one line per sign with `file:line`.
- `unslop/decisions.md`: token names and values chosen in Phase 1 (radius, ramp, type scale, motion), sidebar width, copy decisions such as the nav label.
- The "needs shared change" requests from Wave B, until applied.

**Compact points, in order:**

| # | Compact after | Why here |
|---|---|---|
| 1 | Phase 0 approved | Audit output and screenshot logging are bulky and now saved in `unslop/`. Direction is on disk. |
| 2 | Phase 1 reviewed locally | Token work is large and diff-heavy. Later phases only need the token names in `unslop/decisions.md`. |
| 3 | Phase 2 reviewed locally, **before launching Wave B** | Gives the main thread a clean context to brief 4 agents and to receive their reports. |
| 4 | Wave B agents returned and shared changes applied, **before the e2e run** | Agent reports and Wave B file churn are large. The e2e failure loop needs room. |
| 5 | Phase 9 e2e green, before the final report (optional) | Only if context is still heavy. The report needs the direction and per-pass summary, which are on disk. |

**Sequential variant (no parallel agents):** also compact after Phase 4 (largest phase: 621-line transaction sheet, three sub-steps) and after Phase 6. Phases 3, 5, 7 and 8 are small enough to run back to back.

**After each compact, resume with:** "Read `docs/unslop-phases.md`, `unslop/direction.md` and `unslop/decisions.md`, then start Phase N." Wave B subagents have their own context, so they do not need compaction. They get the same three files in their brief.

## Cross-phase risks

- e2e specs select by visible text and aria-labels (`tests/e2e/pages.spec.ts` and others), so copy changes break them unless updated in the same phase.
- Widening the sidebar changes content width on every page, so Phase 2 must land before Phases 3 to 8.
- The radius tokens in Phase 1 shift every screen at once. Review locally before continuing.
- `package.json` and `package-lock.json` are already modified from the earlier Playwright install. Review that diff separately.
