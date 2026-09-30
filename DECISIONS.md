# Decisions

Choices made while building, with the reason for each. The stack itself (Supabase, Next.js, pnpm, Vitest) was fixed by the brief.

## Architecture

**Pure core, thin functions.** Everything testable lives in `packages/core` as runtime-agnostic TypeScript: OCDS mapping, dedupe, geocoding, scoring, prompts and validation, data packs, the quality checker, Markdown/HTML rendering, JSON-LD, sitemap/llms.txt, visibility detection and lead-form validation. Edge functions only load rows, call core and write rows. Core compiles without Node types and uses only erasable TypeScript syntax (`erasableSyntaxOnly`), so it runs unchanged under Deno, Node (Vitest), Next.js, and Node's type stripping.

**Core is copied into the functions, not imported across directories.** `pnpm sync:core` writes `supabase/functions/_shared/core/` (with a "generated" header); CI fails if the copy is stale. Supabase bundles `supabase/functions` on deploy, and relative imports outside it are fragile. A checked-in copy makes deploys deterministic.

**Anthropic SDK, not raw fetch.** `callClaude` uses `@anthropic-ai/sdk` (npm specifier in Deno) with `maxRetries: 1` (the brief's "single retry on 5xx"). It checks the daily cap before every call, logs usage after every call (including refusals), handles `pause_turn` for web search, parses JSON defensively (strip fences / extract the object) and retries once with a correction message. For models that support it, requests opt into server-side refusal fallback (`fallbacks: "default"`). A refusal throws a typed error. Radar lead drafting then falls back to a deterministic template flagged `draft_from_template`, so a lead is never lost.

**JSON by prompt, not structured outputs.** The brief specifies defensive parsing with one retry. Structured-output schemas would add a request shape that couldn't be tested against the live API here. Every model response goes through a hand-written validator (`validateEnrichment`, `validateOutreach`, `validatePageDraft`…) that clamps enums and ranges and never trusts the model.

**Default model is `claude-sonnet-5-5`** (from the brief; editable in Settings). Sentiment uses `claude_cheap_model` (default `claude-haiku-4-5`), since the brief asks for a cheap call there. OpenAI defaults to `gpt-5` and Perplexity to `sonar`, both editable, because current model names change often.

**Batch steps that chain themselves.** Edge functions have a wall-clock limit, so no function tries to do a whole run. Each step works for about 110 seconds, logs its own `job_runs` row, then calls itself (ingest with a cursor continuation, enrichment while "new" projects remain) or the next step, authenticated with `CRON_SECRET`. `radar-run` only starts the chain; the last step rolls a summary into the parent row. Chained calls run in `EdgeRuntime.waitUntil` so callers get an immediate `202`.

**Ingest windows come from the last _successful window end_,** not the last start time, so a run that needed continuations never leaves a gap. First run: 3 days; `backfill_days` up to 365.

**Find a Tender is queried without `stages`** (it drops Procurement Act 2023 notices). `isAwardRelease` keeps releases with a live award that has suppliers. Values in non-GBP currencies are dropped rather than converted.

**Dedupe:** a batch is collapsed to the latest release per `ocid`; releases matching an existing row from _another_ source (same `ocid`, or same normalised title + supplier + value rounded to £1k) are skipped; same-source rows pass through so updates upsert by `source_id`.

**Postcodes are never invented.** An AI-returned postcode is kept only if it appears in the notice text or delivery addresses. Otherwise it's dropped and "high" confidence becomes "medium". Geocoding is postcode → outcode (terminated postcodes) → town. If a relevant project can't be located, it goes to `needs_review`.

**Scoring** (pure, tested; the brief fixes the maxima): value 25 on a log scale from £500k to £50m (unknown value: neutral 8); workers away 25 via a square-root curve reaching max at 60; distance 25 at the site falling to 5 at the radius edge; start 15 within 30 days, tapering to 0 at 90 (unknown: 4); confidence 10/6/2. No stock within the radius caps the score at 40 and adds `sourcing_opportunity`.

## Database

**Roles via `SECURITY DEFINER` helpers.** `has_role()`, `is_staff()` and `my_role()` read `admin_users` without going through its RLS, avoiding recursive policies. `admin` passes every check. Policies: sales owns Radar, leads and properties; editor owns SEO content and towns; staff can read settings, towns, properties and jobs; only admin sees `api_usage` and edits settings and roles. Anonymous users see nothing. The public endpoints use the service role, and only after checking content is published. RLS is enabled on every table, including `private.rate_limits`.

**Vault for secrets the database needs.** pg_cron and triggers call functions through `private.call_function`, which reads `project_url` and `cron_secret` from Supabase Vault. The leads webhook URL is also a Vault secret. Nothing secret is stored in tables or migrations.

**Crons are gated and timezone-safe.** Each job is scheduled at both candidate UTC hours; `private.run_if_due` fires only when the Europe/London hour matches and `settings.crons_enabled` is true (default false, so nothing runs unattended before the first-run review).

**Generated `lat`/`lng` columns** next to every `geography` column, because PostgREST returns geography as EWKB hex.

**Published snapshots.** `seo_pages` and `blog_posts` keep a `published_snapshot` (exactly what the public endpoints serve). Generating, editing and the monthly refresh change the working copy only, so a live page is never replaced by unreviewed text or taken offline by a regeneration. Publishing freezes a new snapshot.

**Similarity by kind.** `seo_similar_pages` compares pages with pages and posts with posts. A cross-type trigram comparison flagged a blog post as 0.54 similar to a location page purely from shared vocabulary. Above 0.5 is a flag and penalty (the brief); above 0.8 blocks review outright, since that's effectively a copy.

**Company suppression** is computed from `do_not_contact` leads (Companies House number or normalised name) rather than a separate list, so the leads app only has to set one status.

**Reference data in a migration:** 215 towns (the brief asked for about 150; all its named hotspots are included) with town-centre coordinates, the 14 seeded project pages and 40 visibility prompts. `population` and `avg_hotel_pppn` are left **empty on purpose**: both appear in public copy and cost tables, and filling them from memory would be inventing facts. Without a hotel rate, the page gets a cost section that makes no numeric claims.

## Content quality

**Data pack in code, numbers checked in code.** Every number in the copy must appear in the pack, in a common rounding of a pack number (£6.15m, 11,004, 69%), or in the company facts (phone, 24/7, bedroom range, credit terms, hotel-saving range). Digits glued to letters (A39, M5, HS2), list markers, URLs and clock times are ignored. An unverifiable number blocks review regardless of the rest of the score.

**Queue priority is recomputed daily** from stock within 15 miles (towns) or 25 miles (project sites) and qualified projects within 20 miles, so towns near our houses aren't starved by the seeded project list. Towns with neither are never auto-queued (thin pages are what Google's scaled-content policy targets). Auto-created project pages are skipped within 5 miles of an existing project page.

**Drip publishing:** approving puts a page in a queue; the daily job publishes up to _pages per day_ approved items, oldest first. "Publish now" exists for urgent pages. Nothing reaches the public endpoints without a person approving it.

**Safe rendering.** The Markdown renderer escapes all HTML and keeps only http(s), root-relative, `mailto:` and `tel:` links; JSON-LD is escaped against `</script>` breakout. Links in AI visibility answers are rendered only for http(s). The admin preview is the public renderer's HTML in a sandboxed iframe, so it matches exactly.

## Admin app

**Next.js 16** (current at build time): `proxy.ts` refreshes the Supabase session (the renamed middleware); authorisation is RLS plus a role check in the dashboard layout and in every server action. The app never holds the service-role key. It calls edge functions as the signed-in user; functions verify the JWT and role themselves (`verify_jwt = false` at the gateway so the same functions also accept the cron secret).

**shadcn-style components written in place** (Button, Card, Table, Sheet…) rather than via the shadcn CLI, keeping dependencies to Radix Dialog, CVA and tailwind-merge. Tailwind v4 with the brand navy and safety orange as theme tokens.

**Charts:** engine colours are slots 1–3 of a validated categorical palette (blue, orange, aqua; passes the CVD separation check). Aqua is under 3:1 contrast, so the chart has a legend and the prompt×engine grid doubles as the text view. Heatmap cells carry text labels (`#2 cited`, `Rivals only`), not just colour.

**CSV import** geocodes postcodes in bulk (100 per request) and takes the town from the parish/ward, because the specified CSV has no town column but properties need one. Rows with the same name and postcode as an existing property are skipped, so re-importing a sheet is safe.

## Testing

- 109 Vitest tests against hand-written fixtures that follow the published OCDS shapes. The government APIs were unreachable from the build environment, so no live samples were fetched; fixtures include tricky cases (tender-only releases, `amountGross`, EUR values, `durationInDays`, cross-source duplicates, invented postcodes).
- `scripts/db-test` builds a database from the migrations on plain Postgres + PostGIS + pg_cron (with small Supabase stubs) and asserts RLS per role, matching, webhook firing, suppression, rate limiting, similarity and the cron guard. It runs in CI.
- Edge functions were run end to end on a local Supabase stack with `scripts/dev/mock-apis.mjs` standing in for every external API (enabled only by `DEV_EXTERNAL_API_PROXY`, never set in production).
