# Decisions (Phase 1: foundations)

Later phases consume these. Do not add raw values.

## Theme plumbing
- `globals.css`: each color is declared once as `light-dark(<light>, <dark>)`. `data-theme` only flips `color-scheme` (`dark`, `light`, `light dark` for system). The duplicated `system` block is gone.
- `src/lib/theme.ts`: `parseTheme()`, `THEME_COLOR` (`dark #050506`, `light #f3f3f5`, same as `--bg`). Reuse in Phase 8 for the manifest.
- `layout.tsx`: `generateViewport()` reads the `theme` cookie (array with media queries for `system`). `<Toaster theme={theme}>`.
- Lucide icons: one stroke, `svg.lucide { stroke-width: 1.5 }` in base. Use size 16 or 18.
- Global focus ring: `:focus-visible` 2px accent, offset 2px.

## Color (neutral ramp, three text roles, one accent)
| token | light | dark |
|---|---|---|
| `--bg` | #f3f3f5 | #050506 |
| `--surface` / `-2` / `-3` | #fff / #f6f6f8 / #ececf0 | #121214 / #1a1a1d / #232327 |
| `--border` (hairline) | #e3e3e8 | #26262b |
| `--text` | #111114 | #f5f5f7 |
| `--muted` (>=5:1) | #6b6b75 | #8d8d96 |
| `--faint` (~4.5:1, was 2.6/2.8) | #787883 | #7a7a83 |
| `--accent` / `--accent-fg` | #3d6fe0 / #fff | #6c9cff / #0b1020 |
| `--good` `--warn` `--bad` (toned) | #1c7a3b #9a6700 #c93a3a | #3fae6a #e0a526 #e5605f |

- `--plan` is now `var(--accent)`. Plan and EMI ramp `--plan-lo/--plan-hi` are pale blue to accent blue. No purple in the chrome.
- Chart palette `--c1`..`--c8` unchanged, `--c7` kept (periwinkle dark, indigo light), last in trip rotation. New neutral steps: `--chart-n1` (strong), `--chart-n2` (mid), `--chart-muted` (quiet). `--grid` = `--border`. Exports in `charts/colors.ts`: `ACCENT`, `NEUTRAL`.
- Utilities: `bg-plan`, `text-plan` still exist (now accent). Phase 3/4/5 may switch to `accent` directly.
- Calendar "today" marker is accent too, now the same hue as EMI tiles. Phase 3 should separate them (ring vs fill).

## Radius (utilities `rounded-*`)
| token | value | use |
|---|---|---|
| `--radius-control` | 10px | button, input, row, segmented, close buttons, popover |
| `--radius-inset` | 8px | block inside a card (Insight, inner panels) |
| `--radius-card` | 16px | cards, empty state |
| `--radius-panel` | 20px | sheets, drawers |
- Nested rule: inner = outer - padding, min 4. Segmented inner radius is `calc(var(--radius-control) - 4px)`.
- `rounded-full` only for status chips (Badge), dots, avatars. Raw `rounded-2xl`, `rounded-3xl`, `rounded-[28px]` still exist in feature code: swap them per phase (grep checklist in Phase 9).

## Spacing (4px grid, utilities `p-*`, `gap-*`)
`compact` 16, `card` 20, `card-lg` 24, `page` 24, `page-lg` 32. Example: `p-card`, `px-page lg:px-page-lg`.
- `Field` label gap 8. `Badge` px 8.
- `--sidebar-offset` (in `:root`, default 7rem) is where content starts right of the shell sidebar. `Sheet side="left"` and its backdrop dock there. **Phase 2 must set it** for the 240px sidebar.

## Type
- Scale unchanged (xs 12 ... 3xl 32). No arbitrary `text-[Npx]` left (fixed in `bell.tsx`, `card-tile.tsx`, `notification-panel.tsx`).
- New utilities: `text-label` (12px, 500, 0.01em, no color) replaces `uppercase tracking-wide`. `money` (Geist Mono, tabular) is the ledger signature, money amounts only. `.num` is tabular only, `.num-lg` adds -0.02em for display figures.
- `.card-title`: Bricolage weight 500 (was 700), tracking -0.01em, 22px. Display font now loads only weight 500.

## Details
- Shadows: only `shadow-pop` (`0 4px 12px var(--shadow-color)`, transparent on dark). Removed `shadow-2xl` (sheet), `shadow-xl` (InfoTitle). Still raw `shadow-xl` on popovers in feature code (Phases 2-6 swap to `shadow-pop`).
- Dialog scrim `rgb(0 0 0 / 0.5)`, no blur.
- Button: control radius, `active:scale-[0.98]`, named transition props, sizes unchanged (36/44/48).
- Segmented: raised surface (`surface-3`) plus `ring-text/10` hairline, no pill, slide via `transform` + `width`.

## Motion
- One curve `--ease-ui` = `cubic-bezier(0.22, 1, 0.36, 1)`. Tailwind default timing function is that curve, default duration 150ms, so `transition-colors` etc. inherit it.
- Durations: `--dur-fast` 150, `--dur-base` 200, `--dur-slow` 320. Use `duration-(--dur-base)`.
- Sheet and settings keyframes use the tokens. JS `PANE_MS` and `PANE_EASE` in `settings-transition.tsx` are Phase 7.
- Rule for later phases: no bare `transition`, no `transition-all`; name the properties.

## Open / for Phase 2 onward
- `--c7` and `--plan-hi` not re-validated for colour-blind distance; only c7 reviewed by eye.

## Phase 2: app shell
- Sidebar 240px wide (`w-60`), `rounded-card`, `p-compact`, floating with 16px page padding and 16px gap, so `--sidebar-offset` = `17rem` (16 + 240 + 16). Measured at 1440: aside x16 w240, main x272.
- Rows (`SIDE_ROW` in `shell/nav.ts`): 36 tall, 4px gap, `px-3`, icon 18 in one column (x45), label `text-sm` 500 on one line. Idle `text-muted`; active = `bg-surface-3 text-text ring-1 ring-inset ring-text/10` (surface step plus hairline, no inverted fill). Nav links, bell and sign out all use it.
- Top: logo 24 + name "Spend Analyser". Footer: Notifications, Sign out, then the accent "Add transaction" button (`Button size=sm`). `SideTip` tooltips are gone.
- Content: `main` is `mx-auto w-full max-w-400` (1600).
- Nav labels: **Transactions** everywhere (desktop, mobile tab, More sheet). Mobile "Activity" rename removed; "Activity" stays only as the tab name inside the Transactions page. Insights icon: `Lightbulb` (was Sparkles). Nav icons 18.
- Mobile: bottom bar `bg-surface` (no blur), "+" is `h-11 w-11 rounded-control bg-accent`, flat, no `-mt-6`, no shadow. Header bell is `rounded-control`, badge stays a circle chip.
- Bell: `variant="sidebar"` is a labeled row with the unread count inline at right (`ml-auto`); `tip` prop removed.
- Notification drawer: section labels `text-label` sentence case; rows `rounded-card`, icon tile `rounded-inset`, inner review block `rounded-inset`, row menu `rounded-control` with `shadow-pop`; action button default `sm` (36). Panel skeleton lost `animate-pulse` (static). Icons 18.
- e2e: nav is not selected by link name anywhere; "Add transaction" and "Notifications" accessible names are unchanged. No selector edits needed.
- Still raw in drawer: `rounded-full` on the "n new" count chip and unread dot (status chips, allowed).

## Wave B (phases 3 to 8) and main-thread follow-ups
- Signature split: `money` (Geist Mono) on row amounts, table cells, tooltips, small figures. Display-size figures (text-xl and up: KPI strips, donut centre, stat tiles, card owed, trip total) use `num-lg` (Geist Sans, tabular, -0.02em), because mono renders a wide comma gap at large size ("$3 , 616").
- `cn()` (`src/lib/utils.ts`) now uses `extendTailwindMerge` with `p-compact|card|card-lg|page|page-lg`, `rounded-control|inset|card|panel`, `text-label`, `shadow-pop`. Before, `cn("p-card","p-0")` kept both. Test: `tests/unit/cn.test.ts`.
- `Select` (`ui/field.tsx`) has a chevron (wrapper `relative flex`, so width classes on the select still work).
- Dashboard: calendar today marker is an ink ring, selected day ink `ring-2`, EMI tiles stay accent fill. Heat tops at ~60%. Bars neutral, only the selected month is accent (or bad if overspent).
- Cards tab: card tile is flat `bg-text text-bg` with hairline frame, chip and contactless mark. New `cards/stat-strip.tsx` (ruled strip) replaces rows of stat cards.
- Settings home is a grouped list (one 56px row); pane transition 320ms / `--ease-ui`.
- System states: `app/{error,not-found,loading,global-error}.tsx`, `(app)/{error,not-found,loading}.tsx`, shared `components/auth/system-state.tsx`. `manifest.ts` replaces `public/manifest.webmanifest`; `icons/icon-maskable.svg` new. Reset password stays inside the shell on purpose (needs the recovery session).
- Auth headings: "Log in", "Create account", "Forgot password", "Set new password". Button labels unchanged ("Sign in" etc.), so no e2e edits.
- Not changed on purpose: `SERIES` in `charts/colors.ts` (spent c1, income c3) because Insights/Transactions trend pairs two series.
