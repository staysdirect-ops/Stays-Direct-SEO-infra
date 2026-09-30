# Architecture Decisions

## Stack Selection

### Supabase for Backend
- **Decision**: Use Supabase (managed Postgres + Auth + Edge Functions)
- **Rationale**: PostGIS for geospatial matching, pg_cron for scheduled ingestion, pg_net for webhooks, built-in auth simplifies admin dashboard access
- **Trade-off**: Vendor lock-in, but rapid development and low ops overhead outweigh for MVP

### Next.js (App Router) for Admin UI
- **Decision**: Next.js 14 with App Router, TypeScript, Tailwind, shadcn/ui
- **Rationale**: Server Components reduce JS bundle, App Router aligns with modern React, shadcn/ui enables rapid prototyping with accessible components
- **Trade-off**: Requires Node.js hosting (Vercel), not static-only
- **Color scheme**: Navy #0B1F3A (professional) with safety-orange #F26B1D (accent) for high-visibility CTAs

### Shared Core Package
- **Decision**: All AI, parsing, scoring, and quality logic in `packages/core/` as pure TypeScript
- **Rationale**: Edge Functions and tests both import; no Node-only APIs keeps Deno-compatible for workers
- **Trade-off**: Slightly more coordination between packages, but avoids duplication and enables unit testing before deployment

### Vitest + Fixtures
- **Decision**: Use Vitest (fast, ESM-native) with real sample API responses as fixtures
- **Rationale**: Fast iteration, fixtures act as contract tests, mocking all external APIs prevents test brittleness
- **Trade-off**: Must hand-write or fetch fixtures once; fixtures can become stale

## Data Model

### Single Settings Row
- **Decision**: `settings` table with single row (id=1), all constraints enforced
- **Rationale**: Simple app config (models, spend cap, CPV filters, message templates) doesn't need multiple instances; easier UI (single form, not a list)
- **Trade-off**: Requires migration if config structure changes, but migrations are already mandatory

### Leads + leads_export View
- **Decision**: Physical `leads` table; `leads_export` as read-only view with stable columns
- **Rationale**: Leads CRM is separate (Lovable app), so we only guarantee a stable export contract; view prevents accidental column renames breaking external consumers
- **Trade-off**: Separate view is redundant in simple cases, but protects against schema drift

### Admin Roles (admin, sales, editor)
- **Decision**: Three roles with RLS policies on every table
- **Rationale**: Admin gets full access; sales sees Radar + leads (business generation); editor sees only SEO content queues
- **Trade-off**: Simpler than fine-grained permissions, but adequate for team size

## API Integration

### Claude + Spend Cap Enforcement
- **Decision**: `callClaude()` in core logs usage to DB, skips requests if today's spend exceeds cap
- **Rationale**: Prevents runaway costs during development; cap is per-environment setting
- **Trade-off**: Synchronous spend check adds latency; queue-based approach would decouple but add complexity

### Exponential Backoff + Retry
- **Decision**: 5 retries max, backoff: 2s, 4s, 8s, 16s, 32s; ≤1 req/sec to government APIs
- **Rationale**: Aligns with UK government API guidance; 32s cap prevents excessive re-hammering
- **Trade-off**: Could implement circuit breaker, but 5 retries covers transient errors adequately for batch ingestion

## Scoring Algorithm

### Pure Function in Core
- **Decision**: `scoreProject()` is a unit-testable pure function, not in Edge Functions
- **Rationale**: Tests can run offline; scoring logic easy to tweak and review
- **Trade-off**: Scoring must be re-implemented in Edge Functions (or imported via core), but that's the architecture goal

### Score Components (0–100)
1. Value: up to 25 (project size)
2. Workers away from home: up to 25 (crew size)
3. Property distance: up to 25 (match quality)
4. Timeline: up to 15 (start within 90 days)
5. Location confidence: up to 10 (geocoding quality)
- **Cap with no nearby stock**: 40 max, flag `sourcing_opportunity`

**Rationale**: Combines deal size, demand (crew size), supply match, and urgency; flags high-value leads even without stock (pipeline work)

## Content Quality

### Data Pack in Code, Not AI
- **Decision**: Build the data pack (properties, projects, hotel costs) as a pure function before passing to Claude
- **Rationale**: Quality checker can verify numbers are from pack; prevents hallucinated facts; easier to test and version
- **Trade-off**: More scaffolding code, but ensures verifiable, repeatable content

### Banned Phrase List
- **Decision**: Hard-coded list (nestled, vibrant, quaint, charming, etc.) checked on every page
- **Rationale**: Quick quality gate; prevents fluffy marketing language that doesn't match brand voice ("Direct, practical, no fluff")
- **Trade-off**: Could use Claude to detect clichés, but deterministic list is faster and auditable

## Deployment

### Supabase Edge Functions in Deno/TypeScript
- **Decision**: Ingestion, enrichment, matching, lead generation all run as Edge Functions orchestrated by a daily cron
- **Rationale**: Serverless = no infrastructure; Deno native TypeScript; pg_cron triggers via `pg_net` POST
- **Trade-off**: Cold starts (few seconds), limited to Supabase ecosystem; but for daily batch work, acceptable

### Vercel for Admin App
- **Decision**: Next.js app deployed to Vercel
- **Rationale**: Zero-config, built-in analytics, preview deployments, integrated with GitHub
- **Trade-off**: Adds cost for high-traffic apps; but admin dashboard is low-traffic

### Stable API Exports
- **Decision**: Three public Edge Functions for the main website:
  1. `public-content` - JSON (location/project/blog pages)
  2. `public-render` - Standalone HTML for crawlers
  3. `public-sitemap` - XML with lastmod
- **Rationale**: Website can choose client-side (JSON) or server-side render (HTML); sitemap for SEO; both rated public/3600s cache
- **Trade-off**: Duplication (Markdown + JSON + HTML), but necessary for crawler compatibility (GPTBot, ClaudeBot, PerplexityBot don't run JS)

## Future Considerations

### Webhook Delivery
- The `leads` table has a trigger that POSTs to `LEADS_WEBHOOK_URL` on insert/status change
- Webhook is optional (if not set, POSTs are skipped)
- Lovable leads CRM subscribes to receive new/updated leads
- Retry logic and idempotency handling on Lovable side

### Monitoring & Alerts
- Not yet implemented; `job_runs` table logs all batch execution
- Future: CloudWatch/Datadog integration for cost spikes, missing runs

### Backfill & Manual Workflows
- First run: backfill 90 days of contracts, manual review of projects before lead generation
- Admin UI has "Run Radar now" button with optional backfill window
- No fully automated lead sending until quality validated
