# Wave B brief (shared by agents B1 to B4)

Polish-mode unslop of Spend Analyser, running as 4 parallel agents in ONE working tree. Phases 0 to 2 are done. You own one slice.

## Read first (in this order)
1. `docs/unslop-phases.md`: your phase section(s), "Rules for every phase", "Rules that make parallel work safe".
2. `unslop/direction.md`: approved direction (calm, exact, plain-spoken; ledger; signature = tabular mono money, right-aligned, hairline row rules).
3. `unslop/decisions.md`: tokens already built. USE them, add no raw values.
4. `unslop/audit.md`: lines for your files.
5. Skill passes + checklist: `/Users/tanmaybhuskute/.claude/plugins/cache/heydamir/unslop/620163eedb35/skills/unslop/SKILL.md` and `references/signs.md`, `references/tokens.md`.
6. `AGENTS.md`: this Next.js (16.3.8) differs from training data. Read the relevant guide in `node_modules/next/dist/docs/` before touching routing, metadata, `loading`/`error`/`not-found` files.

## Hard rules
- **Write ONLY inside your ownership list.** Shared files are read-only: `src/app/globals.css`, `src/components/ui/*`, `src/components/shell/*`, `src/components/notifications/*`, `src/lib/*`, `src/app/layout.tsx`, `tests/**` (except e2e selector edits, see below), `package*.json`. If you need a token or primitive change, do NOT edit: list it under "needs shared change" in your report (what, why, exact proposed value).
- Another agent owns each other slice. A file imported by both slices (e.g. a component used on two routes) belongs to whoever the ownership table says; do not edit it from the other side.
- Local only. Never commit, push, deploy, run `supabase db reset`/`migration`, or touch hosted anything. No migrations. Do not read or print `.env.local`.
- Do NOT start a dev server (one is running on http://localhost:3000, local Supabase on 127.0.0.1:54321). Do NOT run `tsc`, `eslint`, `npm test`, or Playwright test suites: other agents are mid-edit and you would see their errors. The main thread runs all checks after the wave.
- Screenshot only your own routes, from the running dev server, using the pattern in `/private/tmp/claude-501/-Users-tanmaybhuskute-Documents-spend-analyser/edb2cb3e-900b-4ecf-8e5c-d6753d962f7e/scratchpad/p2.mjs` (login via env vars SEED_DEMO_USER_*, never print them; run with `node --env-file=.env.local`; it refuses non-local Supabase). Copy that script to the scratchpad dir under your own name; do not edit the original. Before = `unslop/before/` already exists. Save after shots to `unslop/after/<your-agent-id>/` (desktop 1440x900 and mobile 390x844, dark and light). Look at them (Read the PNGs) and fix what is off. At most 3 render rounds.
- Dev server hot reloads. A transient compile error from another agent's file may appear; wait a few seconds and retry rather than "fixing" files you do not own.
- e2e specs select by visible text. If you change any copy/label/aria-label/role in your slice, grep `tests/e2e` for the old text and edit that selector in the same change. Report each selector changed. Edit only the lines you must.
- Tokens: radius `rounded-control|inset|card|panel`, spacing `p-compact|card|card-lg|page|page-lg`, `shadow-pop` only, `text-label` (sentence case, replaces `uppercase tracking-*`), `money` for money amounts, `.num` for other figures, `duration-(--dur-fast|base|slow)`, no `transition-all`, no bare `transition`, no `animate-pulse`, no `text-[Npx]`, icons 16 or 18 (stroke is global), `rounded-full` only for status chips/dots/avatars. Replace raw `rounded-2xl|3xl|[28px]`, `shadow-lg|xl|2xl`, `bg-*/NN` hex-ish values, `uppercase`.
- Known carry-overs: calendar "today" marker is accent and now same hue as EMI tiles (separate: ring vs fill); `--plan` is now just accent; swap raw `shadow-xl` popovers to `shadow-pop`.
- Copy: no exclamation marks, no trailing periods on labels/buttons/captions (paragraphs keep them), no greeting headlines, "vs last month" style comparisons. AI privacy claims in `settings/ai/page.tsx:53-54` and `settings/ai/usage/page.tsx:28` stay as written. Never invent facts. Keep behaviour identical: this is a visual/copy polish, not a refactor. No new dependencies.
- Keep all code that exists working: do not remove props that other files pass.

## Report (your final message, short, no screenshots inline)
1. Files changed (paths).
2. One line per pass (spacing, color, icons, copy, type, layout, details, visuals, motion) of what changed.
3. Where to look: localhost URLs and what to click.
4. "Needs shared change": list, or "none".
5. e2e selectors changed: file:line old -> new, or "none".
6. Leftover tells you did not fix and why.
7. Screenshot dir.
