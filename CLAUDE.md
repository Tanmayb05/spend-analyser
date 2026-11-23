@AGENTS.md

# Local-first workflow (read before making any change)

The user must be able to see every UI and backend change running locally **before** anything is committed or deployed. Vercel deploys only after the user commits and pushes, so never do anything that reaches Vercel or hosted Supabase on your own.

## Rules

1. **Local only.** Make all changes in the working tree and verify them against local Supabase (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` in `.env.local`). Never point `.env.local` at the hosted project.
2. **Never run** `git commit`, `git push`, `vercel deploy`, `supabase db push`, `supabase link`, or any MCP/CLI call that writes to hosted Supabase or Vercel, unless the user explicitly asks in that message.
3. **Database changes = new migration file** in `supabase/migrations/` (timestamped, never edit an already-applied migration). Apply locally with `npx supabase migration up` (keeps data) or `npx supabase db reset` (wipes local data, so ask first if the user may have local data they care about). Then run `npm run db:types`.
4. **Make sure the local stack is running** before telling the user to look: check `npx supabase status`; start with `npx supabase start` if needed (Docker must be running). Start `npm run dev` (http://localhost:3000) if it is not already running.
5. **Verify before handing back:** `npm run typecheck`, `npm run lint`, `npm test`, plus `npm run test:db` when the schema changed. Report failures plainly.

## Secrets in `.env.local` (never read values)

- **Never** `cat`/`Read`/`grep -v`/`echo` `.env.local` or print any env var value. Do not let a secret appear in tool output, logs, commits, or chat.
- To see which keys exist (names only): `grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' .env.local | tr -d '='`
- To use a key, reference it by env var name, never paste the value. For ad-hoc scripts: `node --env-file=.env.local script.mjs` and read `process.env.NAME` inside the script. For shell: `set -a; source .env.local; set +a` then use `$NAME` — never `echo $NAME`.
- Scripts must not log the key, request headers, or full request objects. Print only status codes and response bodies.
- Put temporary scripts in the scratchpad dir, not the repo.

## When finishing a change, always report

- What changed (files, migrations).
- Exactly where to see it: the URL/page on `http://localhost:3000` and what to click.
- Whether a migration was added and whether it has been applied locally.
- A "before you ship" note: commit and push first, then `npx supabase db push` for any new migration. Migrations that are additive can go before the UI deploy. Destructive ones (drop/rename column) need a two-step deploy. Flag that explicitly if relevant.
- Leave the working tree uncommitted so the user can review the diff.

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

# UI style

All new or changed UI must follow the "UI style" section in `AGENTS.md` (unslop pass): token-only colors/radius/spacing, one accent, hairline rules, `money`/`num-lg` figures for amounts, `shadow-pop` only, no gradients/glows/emoji/sparkle icons/uppercase-tracked labels/pulsing. Before finishing UI work, grep for leftovers: `rounded-2xl|rounded-3xl|uppercase tracking|animate-pulse|shadow-(lg|xl|2xl)|transition-all|text-\[\d+px\]`.
