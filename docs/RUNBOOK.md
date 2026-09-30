# Runbook

How to start the system safely, run it day to day, and fix the usual problems.

## First run (in this order)

Scheduled jobs stay **off** until step 7, so nothing runs unattended before a person has checked the output.

1. **Add secrets and deploy.** Follow [DEPLOY.md](DEPLOY.md). Check Settings → the spend cap (default $10/day).
2. **Import properties.** Admin → Properties → Import CSV. Columns: `name,address,postcode,bedrooms,max_guests,parking_spaces,van_parking,pppn_from,available_from,status` (download the template from the page). Town and map position come from the postcode. Rows already in the list (same name and postcode) are skipped. Check nothing shows "not found" in the Location column; fix postcodes and use "Locate missing".
3. **Fill in towns.** Admin → Towns → tick "Missing hotel rate". Enter a typical hotel price per person per night for the towns you care about. It feeds the hotel-vs-house table on location pages; towns without one get a section that makes no numeric claims. Population is optional and also appears in copy, so only enter real figures.
4. **Radar 90-day backfill.** Admin → Radar → Projects → "Backfill 90 days" → Run Radar now. It runs in batches (see Job Runs) and pauses for the day if it hits the spend cap; run it again the next day to continue enrichment. Expect a few hundred relevant projects.
5. **Review 50 projects.** Sort by score and open the drawer for each. Check the site location (the map and "Site location" section), mark wrong ones relevant or not, and set a postcode where the AI couldn't find one. Look at the drafted leads and edit the tone if needed. This tells you whether the scoring suits you before you rely on it. Adjust Settings (minimum value, radius, CPV prefixes) if needed.
6. **Generate 5 pages and review them.** Admin → SEO → Location pages → tick 5 towns near your houses → Queue generation. After a few minutes open each: read the preview, check the Quality tab (every number must come from the data pack), fix copy, Save, Approve, Publish. Do the same for one project page (Hinkley Point C is seeded) and one blog topic (Topics → Write now).
7. **Run the AI visibility baseline.** Admin → AI Visibility → Run now. This is week zero for the trend.
8. **Enable crons.** Admin → Settings → tick "Run scheduled jobs" → Save.

Then wire up the website ([WEBSITE_INTEGRATION.md](WEBSITE_INTEGRATION.md)) and check `curl -A GPTBot https://staysdirect.co.uk/contractor-accommodation/<town>` returns the full page.

## Schedule (UK time, once crons are on)

| When               | Job                  | What happens                                                                                                                                               |
| ------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily 06:00        | `radar-run`          | Ingest Contracts Finder and Find a Tender since the last run → AI analysis → match houses → score → leads with draft outreach                              |
| Daily 07:00        | `seo-run pages`      | Queue the best towns and big Radar projects, generate up to _pages per day_ into the review queue, and publish up to _pages per day_ approved pages (drip) |
| Mon/Wed/Fri 07:30  | `seo-run blog`       | Write the next queued (or best idea) topics into drafts                                                                                                    |
| Monday 06:45       | `seo-suggest-topics` | 15 new ideas, checked against the live blog sitemap, plus topics from big new Radar projects                                                               |
| Monday 05:00       | `ai-visibility-run`  | 40 prompts × ChatGPT, Claude, Perplexity                                                                                                                   |
| 1st of month 04:00 | `seo-run refresh`    | Live pages whose data changed (new houses, prices, projects) are regenerated into review. The live version stays up until you publish the new one.         |
| Hourly             | `geocode` sweep      | Retries properties/towns that couldn't be located                                                                                                          |

pg_cron runs in UTC. Each job is scheduled at both possible UTC hours and fires only when the UK local hour matches, so clock changes need no action.

## Daily routine

- **Sales**, 10 minutes: Leads board → open new leads (highest score first) → Find contact → edit the draft → send from your own inbox → move the card. **Nothing is ever sent automatically.**
- **Editor**, 15 minutes: Location/Project pages → "In review" → read, fix, approve. Approved pages go live gradually (daily drip) or immediately with "Publish now".
- **Anyone**: Dashboard → recent jobs for failures.

## When a company says "no thanks"

1. Open the lead → Status → **do not contact** → Save (or "Mark do not contact").
2. That's it. Radar checks every new lead against `do_not_contact` leads by Companies House number and by company name. Future projects won't produce leads for that company; those projects are marked rejected with the reason "Suppressed".
3. If they want their details removed, clear the contact fields and notes on the lead but **keep the lead and its status**, or the suppression stops working.

## Costs

AI spend is estimated from token counts and logged to `api_usage` (Admin → API Usage). Rough expectations with the default models:

| Work                                               | Per item               | Typical volume              | Per month |
| -------------------------------------------------- | ---------------------- | --------------------------- | --------- |
| Radar enrichment (Claude Sonnet 5.5)               | ~$0.01 per project     | 20–60 relevant awards a day | $6–$20    |
| Lead drafts                                        | ~$0.01 per lead        | 10–40 a day                 | $3–$12    |
| Location/project page + review                     | ~$0.08–$0.15           | 5 a day                     | $12–$25   |
| Blog post                                          | ~$0.10–$0.20           | 3 a week                    | $2–$3     |
| AI visibility (40 prompts × 3 engines, web search) | ~$0.02–$0.05 per check | weekly                      | $12–$25   |
| 90-day backfill (one-off)                          |                        | a few hundred projects      | $5–$30    |

Roughly **$40–$85 a month** in AI calls at defaults. Supabase Pro ($25/month) and Vercel (free or Pro) are separate. Government APIs, postcodes.io and Companies House are free.

## Raising or lowering the spend cap

Settings → **Daily AI spend cap (USD)** → Save. The cap counts all providers since midnight UK time. When it's reached, AI steps stop cleanly: enrichment pauses (projects stay "new" and continue the next day), lead drafts fall back to a plain template flagged `draft_from_template`, and page generation and visibility checks stop. Raise it temporarily for the backfill, then lower it again.

## Troubleshooting

| Symptom                          | Check / fix                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jobs never run                   | Settings → "Run scheduled jobs" on? Vault secrets `project_url` and `cron_secret` set, and `cron_secret` equal to the `CRON_SECRET` function secret? In SQL: `select * from cron.job_run_details order by start_time desc limit 20;` and `select * from net._http_response order by created desc limit 20;` |
| Job shows "failed" with 401      | `CRON_SECRET` function secret and Vault `cron_secret` differ. Set both to the same value.                                                                                                                                                                                                                   |
| Radar ingest failed              | Job Runs → error text. Government APIs occasionally return 5xx; the ingest retries 5 times with backoff, and the next run re-covers the window (it starts from the end of the last successful window).                                                                                                      |
| Projects stuck on "new"          | Spend cap reached (Job Runs shows `stopped: spend_cap`) or `ANTHROPIC_API_KEY` missing. Run Radar again after raising the cap.                                                                                                                                                                              |
| Project in "needs review"        | AI couldn't place the site. Open it, set the postcode or town, "Set location & match".                                                                                                                                                                                                                      |
| Property shows "not found"       | Postcode unknown to postcodes.io (new builds). Edit the postcode or use a nearby one; saving re-geocodes.                                                                                                                                                                                                   |
| Page stuck in "draft"            | Quality tab lists why: numbers not in the data pack, banned phrases, too few FAQs, or too similar to another page. Edit and Save (re-checks), or Regenerate. Approving a draft is allowed but asks for confirmation.                                                                                        |
| Page says "Too similar to …"     | Two pages share most of their wording. Regenerate one, or edit its local sections. Above 0.8 similarity a page can't pass the check.                                                                                                                                                                        |
| Public URL 404s                  | Only published pages are served. Check the page shows "live". Responses carry `Cache-Control: public, max-age=3600`, so browsers and your CDN may show the old version for up to an hour.                                                                                                                   |
| Leads webhook not firing         | Vault `leads_webhook_url` set? It fires on insert and status change only. Check `net._http_response` for the status code.                                                                                                                                                                                   |
| Visibility shows only one engine | Only engines with an API key run. Add `OPENAI_API_KEY` / `PERPLEXITY_API_KEY` as function secrets.                                                                                                                                                                                                          |

## Re-running pieces by hand

All functions accept the cron secret, and the admin buttons call them with your login. From a shell:

```bash
F=https://<ref>.supabase.co/functions/v1
H=(-H "x-cron-secret: $CRON_SECRET" -H "content-type: application/json")
curl "${H[@]}" -d '{"backfill_days":30}' $F/radar-run
curl "${H[@]}" -d '{"ids":["<project-uuid>"]}' $F/radar-enrich
curl "${H[@]}" -d '{"task":"pages"}' $F/seo-run
curl "${H[@]}" -d '{"page_ids":["<page-uuid>"]}' $F/seo-generate-page
curl "${H[@]}" -d '{}' $F/ai-visibility-run
curl "${H[@]}" -d '{"sweep":true,"retry_failed":true}' $F/geocode
```
