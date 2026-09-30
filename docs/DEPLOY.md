# Deploying the StaysDirect Growth Engine

Two things get deployed:

1. **Supabase project**: database (migrations), 18 edge functions, function secrets, and three Vault secrets that let the database call the functions.
2. **Admin app** (`apps/admin`): a Next.js app, deployed to Vercel.

The main website (staysdirect.co.uk) is a separate codebase. Wiring it up is covered in [WEBSITE_INTEGRATION.md](WEBSITE_INTEGRATION.md).

---

## 1. What you need

| Item                                                                                  | Where it comes from                                                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Supabase project (Pro plan recommended for the longer edge-function wall-clock limit) | supabase.com → New project. Note the **project ref** (the `xxxx` in `xxxx.supabase.co`) and the database password. |
| `SUPABASE_ACCESS_TOKEN`                                                               | supabase.com → Account → Access Tokens                                                                             |
| `ANTHROPIC_API_KEY`                                                                   | console.anthropic.com. Required.                                                                                   |
| `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`                                                | Optional. Only the AI visibility tracker uses them; missing engines are skipped.                                   |
| `COMPANIES_HOUSE_API_KEY`                                                             | Optional, free: developer.company-information.service.gov.uk. Fills in supplier company numbers.                   |
| `CRON_SECRET`                                                                         | Make one: `openssl rand -hex 32`. Used by pg_cron and by functions calling each other.                             |
| `LEADS_WEBHOOK_URL`                                                                   | Optional. The Lovable leads app's webhook endpoint. See [LEADS_CONTRACT.md](LEADS_CONTRACT.md).                    |

Never commit these. `.env.example` lists every name.

## 2. Deploy Supabase (one command)

From the repo root, with Node 22+ and pnpm:

```bash
pnpm install
export SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... SUPABASE_DB_PASSWORD=...
export CRON_SECRET=... ANTHROPIC_API_KEY=...
export OPENAI_API_KEY=... PERPLEXITY_API_KEY=... COMPANIES_HOUSE_API_KEY=...   # optional
export LEADS_WEBHOOK_URL=...                                                   # optional
bash scripts/deploy.sh
```

The script:

1. links the project (`supabase link`),
2. checks `supabase/functions/_shared/core` matches `packages/core` (run `pnpm sync:core` if not),
3. applies all migrations (`supabase db push`): schema, RLS, ~215 towns, 14 seeded project pages, 40 visibility prompts, and 7 pg_cron jobs,
4. sets function secrets (`supabase secrets set`),
5. deploys every function (`supabase functions deploy`; `supabase/config.toml` turns off gateway JWT checks because each function authorises its own callers),
6. writes Vault secrets `project_url`, `cron_secret` and (optionally) `leads_webhook_url` through the Management API,
7. triggers `radar-run` with a 7-day backfill as a smoke test.

### Doing it by hand instead

```bash
npx supabase link --project-ref $SUPABASE_PROJECT_REF
npx supabase db push
npx supabase secrets set CRON_SECRET=... ANTHROPIC_API_KEY=... OPENAI_API_KEY=... PERPLEXITY_API_KEY=... COMPANIES_HOUSE_API_KEY=...
npx supabase functions deploy
```

Then in the Supabase SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
-- optional:
select vault.create_secret('https://your-leads-app.example/webhook?token=<secret>', 'leads_webhook_url');
```

To change one later: `select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<new value>');`

### Supabase dashboard settings

- **Authentication → Providers → Email**: enabled. Turn **off** "Allow new users to sign up" (staff are invited).
- **Authentication → URL Configuration**: Site URL = the admin app URL (e.g. `https://growth.staysdirect.co.uk`); add `https://<admin-domain>/**` to Redirect URLs.
- **Authentication → Emails → Templates**: point the links at the admin app's `/auth/confirm` route, which signs the person in on the server. Without this, invite links land on the app without a session and bounce to the login page. Replace the link in each template:
  - **Invite user**: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/account?welcome=1">Accept the invite</a>`
  - **Magic link**: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/">Sign in</a>`
  - **Reset password**: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account">Reset your password</a>`

  (The app's own magic-link request also works with the default template via `/auth/callback`; the template change is what makes invites work.)

- **Authentication → SMTP**: the built-in sender is rate-limited to a few emails an hour. Set a custom SMTP server (e.g. the one the leads app uses) before inviting a team.
- **Database → Extensions**: `postgis`, `pg_trgm`, `pg_net` and `pg_cron` are created by the first migration. If `db push` fails on an extension, enable it here and re-run.

## 3. Deploy the admin app (Vercel)

1. Import the GitHub repo in Vercel.
2. **Root Directory**: `apps/admin`. Leave "Include files outside the root directory" on (the app imports `packages/core`).
3. Framework preset: Next.js. Install command: `pnpm install`. Build command: `pnpm build` (defaults are fine).
4. Environment variables (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the project's anon (publishable) key
   - The app never needs the service-role key. Everything runs as the signed-in user under RLS.
5. Deploy, then add the domain to Supabase's Redirect URLs (above).

## 4. Give people access

**In the admin app (normal way):** an admin opens **Team**, enters the email, picks a role and clicks **Send invite**. The person gets an email, clicks the link, lands on **Account** and sets a password. Admins change or remove roles from the same page (you can't remove your own admin role). This calls the `admin-users` edge function, which holds the service-role key; the app never does.

**The first admin** has to be created outside the app: invite them from Supabase → Authentication → Users → Invite, then:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... pnpm promote-user alice@staysdirect.co.uk admin
```

| Role     | Can use                                                                         |
| -------- | ------------------------------------------------------------------------------- |
| `admin`  | Everything, including Settings, Team, API usage                                 |
| `sales`  | Dashboard, Radar projects and leads, Properties, AI visibility (read), Job runs |
| `editor` | Dashboard, SEO pages/blog/topics, Towns, AI visibility, Job runs                |

Or in SQL: `insert into admin_users (user_id, email, role) select id, email, 'admin' from auth.users where email = 'alice@staysdirect.co.uk';`

## 5. After deploying

Follow the first-run checklist in [RUNBOOK.md](RUNBOOK.md). Scheduled jobs are **off** until you turn them on in Settings.

## Local development

```bash
pnpm install
supabase start                 # full local stack; loads supabase/seed.sql (demo properties)
supabase status                # prints local URL and keys
cp apps/admin/.env.example apps/admin/.env.local   # fill in the local URL and anon key
pnpm admin:dev
```

For end-to-end runs without API keys or network access, start `pnpm dev:mock-apis` and give the edge runtime `DEV_EXTERNAL_API_PROXY=http://host.docker.internal:8787` plus dummy keys. External calls are then served from `tests/fixtures`. Never set that variable in production.

Checks that CI runs:

```bash
pnpm check:core-sync && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm check:functions            # needs Deno 2
bash scripts/db-test/start-postgres.sh   # Ubuntu; prints PGHOST/PGPORT to export
PGUSER=postgres pnpm test:db    # migrations + RLS assertions
pnpm admin:build
```
