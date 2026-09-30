# StaysDirect Growth Engine: conventions

Read PROGRESS.md first (status, what's left), then DECISIONS.md (why things are the way they are).

## Layout

- `packages/core/src`: all business logic, pure TypeScript. No Node-only APIs, erasable syntax only (no enums, no constructor parameter properties). Relative imports use `.ts` extensions.
- `packages/core/test`: Vitest. Fixtures in `tests/fixtures`. Mock every external call (`fakeClaude`, `jsonResponse` in `test/helpers.ts`).
- `supabase/functions`: Deno edge functions. `_shared/core` is GENERATED. Edit `packages/core/src` and run `pnpm sync:core`; CI fails if it's stale. `_shared/runtime.ts` has the db client, auth (`authorize`), jobs, chaining (`invokeFunction`) and the Claude context.
- `supabase/migrations`: all schema changes as new timestamped SQL files. Enable RLS on every new table and add policies via `has_role()` / `is_staff()`. Add assertions to `scripts/db-test/assertions.sql`.
- `apps/admin`: Next.js 16 (App Router, `proxy.ts` not middleware, async `params`/`searchParams`/`cookies`). Server actions call `requireRole()` first and use the user's Supabase session (RLS). Never use the service-role key in the app.

## Rules that matter

- Outreach is drafts only. Never add automatic sending.
- Generated copy may only state numbers from the data pack or company facts; the quality checker enforces it. Don't loosen `allowedNumbers` to make a page pass. Fix the pack or the prompt.
- Public endpoints serve `published_snapshot` only. Never serve working copy.
- Every AI call goes through `callClaude` (spend cap and usage logging) or records usage via `usageStore`.
- Government APIs: at most 1 request/second, backoff on 429/5xx, 5 retries (`fetchWithRetry` + `createRateLimiter`). Find a Tender without `stages`.
- Keep `leads_export` column names stable (docs/LEADS_CONTRACT.md).
- Never print or commit secret values. `.env.example` lists names only.

## Commands

```bash
pnpm test | pnpm typecheck | pnpm lint | pnpm format:check | pnpm check:core-sync
pnpm check:functions                     # Deno check + lint
PGHOST=... PGPORT=... PGUSER=postgres pnpm test:db   # see scripts/db-test/start-postgres.sh
pnpm admin:build
```

Before committing: run the checks above, update PROGRESS.md, commit, push.
