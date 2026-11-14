@AGENTS.md

# Local-first workflow (read before making any change)

The user must be able to see every UI and backend change running locally **before** anything is committed or deployed. Vercel deploys only after the user commits and pushes, so never do anything that reaches Vercel or hosted Supabase on your own.

## Rules

1. **Local only.** Make all changes in the working tree and verify them against local Supabase (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` in `.env.local`). Never point `.env.local` at the hosted project.
2. **Never run** `git commit`, `git push`, `vercel deploy`, `supabase db push`, `supabase link`, or any MCP/CLI call that writes to hosted Supabase or Vercel, unless the user explicitly asks in that message.
3. **Database changes = new migration file** in `supabase/migrations/` (timestamped, never edit an already-applied migration). Apply locally with `npx supabase migration up` (keeps data) or `npx supabase db reset` (wipes local data, so ask first if the user may have local data they care about). Then run `npm run db:types`.
4. **Make sure the local stack is running** before telling the user to look: check `npx supabase status`; start with `npx supabase start` if needed (Docker must be running). Start `npm run dev` (http://localhost:3000) if it is not already running.
5. **Verify before handing back:** `npm run typecheck`, `npm run lint`, `npm test`, plus `npm run test:db` when the schema changed. Report failures plainly.

## When finishing a change, always report

- What changed (files, migrations).
- Exactly where to see it: the URL/page on `http://localhost:3000` and what to click.
- Whether a migration was added and whether it has been applied locally.
- A "before you ship" note: commit and push first, then `npx supabase db push` for any new migration. Migrations that are additive can go before the UI deploy. Destructive ones (drop/rename column) need a two-step deploy. Flag that explicitly if relevant.
- Leave the working tree uncommitted so the user can review the diff.
