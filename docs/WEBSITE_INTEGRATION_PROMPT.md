# Prompt: integrate the StaysDirect Growth Engine into staysdirect.co.uk

Copy everything below the line into Lovable, Claude or a developer brief. Replace `<ref>` with the Supabase project ref.

---

You are updating the staysdirect.co.uk website. A separate system (the "Growth Engine", on Supabase) publishes SEO location pages, project pages and blog posts through public HTTP endpoints. Integrate it as follows. Do not change existing pages except where stated.

**Base URL:** `FN = https://<ref>.supabase.co/functions/v1`. All endpoints are public (no key), return `Cache-Control: public, max-age=3600`, and return HTTP 404 for unknown or unpublished content.

## 1. New routes

- `/contractor-accommodation`: hub page listing every live location and project page.
- `/contractor-accommodation/:slug`: location page (e.g. `/contractor-accommodation/leeds`).
- `/contractor-accommodation/projects/:slug`: project page (e.g. `/contractor-accommodation/projects/hinkley-point-c`).
- `/blog/:slug`: keep serving our existing posts. If the slug isn't one of ours, show the engine's post instead.
- `/sitemap-seo.xml` → content of `FN/public-sitemap`.
- `/llms.txt` → content of `FN/public-llms-txt`.

## 2. These pages must be fully rendered HTML for bots

GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot and PerplexityBot do not run JavaScript. A client-side React page would be empty to them. So:

- **Preferred:** proxy (rewrite, HTTP 200, not redirect) these routes to the engine's pre-rendered HTML:
  - `/contractor-accommodation` → `FN/public-render?path=/contractor-accommodation`
  - `/contractor-accommodation/projects/:slug` → `FN/public-render?path=/contractor-accommodation/projects/:slug`
  - `/contractor-accommodation/:slug` → `FN/public-render?path=/contractor-accommodation/:slug`
  - `/blog/:slug` for slugs we don't have → `FN/public-render?path=/blog/:slug`
  - `/sitemap-seo.xml` → `FN/public-sitemap`, `/llms.txt` → `FN/public-llms-txt`

  Use the host's rewrite feature (Vercel `vercel.json` rewrites, Netlify `_redirects` with status 200, or a Cloudflare Worker). Preserve the upstream status code (404 must stay 404) and headers.

- **Alternative (only if the site is server-rendered or statically generated):** fetch JSON from `FN/public-content?type=location|project|blog&slug=...` in the server loader and render it in our layout. The JSON has `title`, `meta_description`, `canonical_url`, `h1`, `intro`, `key_facts[]`, `sections[]` (`heading`, `body_markdown`), `body_markdown` (blog), `faqs[]` (`question`, `answer`), `internal_links[]`, `schema_jsonld`. Render markdown with raw HTML escaped. Put `schema_jsonld` in a `<script type="application/ld+json">` and set `<link rel="canonical">` to `canonical_url`. `FN/public-content?type=index` lists every live page.

Acceptance test (must print the H1 and a non-zero count):

```bash
curl -s -A "GPTBot" https://staysdirect.co.uk/contractor-accommodation/<live-town> | grep -o "<h1>[^<]*</h1>"
curl -s -A "ClaudeBot" https://staysdirect.co.uk/contractor-accommodation/<live-town> | grep -c "<h2>"
```

## 3. Sitemaps

- `https://staysdirect.co.uk/sitemap-static.xml` is referenced by our sitemap index but returns 404. Create it, listing our static pages (home, /quote, about, contact, services) with `<lastmod>`, or remove it from the index if another sitemap already covers them.
- Add `<sitemap><loc>https://staysdirect.co.uk/sitemap-seo.xml</loc></sitemap>` to the sitemap index.

## 4. robots.txt

Explicitly allow `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-SearchBot`, `PerplexityBot` and `Google-Extended` (a `User-agent:` block with `Allow: /` for each), keep existing rules for private paths, and include `Sitemap: https://staysdirect.co.uk/<our sitemap index>`.

## 5. Quote form

Make the existing quote form (and any calculator) `POST` JSON to `FN/public-lead`:

```json
{
  "company_name": "",
  "contact_name": "",
  "contact_email": "",
  "contact_phone": "",
  "contact_role": "",
  "site_town": "",
  "site_postcode": "",
  "est_workers": 8,
  "start_date": "YYYY-MM-DD",
  "notes": "",
  "landing_page": "/contractor-accommodation/leeds",
  "utm": { "utm_source": "", "utm_medium": "", "utm_campaign": "" },
  "website": "",
  "source": "seo_form"
}
```

- Email or phone is required. Validate in the browser too.
- On first page view store the landing path and any `utm_*`/`gclid` query values in `sessionStorage`, and send them with the form.
- Add a hidden honeypot input named `website`: position it off-screen (not `display:none`) with `tabindex="-1"` and `autocomplete="off"`, and send its value.
- `source` is `"calculator"` for the calculator, otherwise `"seo_form"`.
- Handle responses: `200 {ok:true}` → thank-you message; `400 {errors:[...]}` → show the errors; `429` → "Too many requests, please call 0800 088 4225".

## 6. Navigation and footer

- Add "Contractor accommodation" (`/contractor-accommodation`) to the main navigation.
- Add a footer block linking up to 20 live towns, built from `FN/public-content?type=index` (items with `kind === "location"`, using each item's `path` and `name`) at build time or on the server, cached for an hour, plus an "All locations" link to the hub.

## Done when

- The three route families serve full HTML to `curl -A GPTBot`, and unknown slugs return 404.
- `/sitemap-seo.xml` and `/llms.txt` work; `sitemap-static.xml` no longer 404s; the index lists `sitemap-seo.xml`.
- robots.txt allows the seven AI crawlers.
- A test quote submission returns `{ "ok": true }` and appears in the StaysDirect leads app with its landing page and UTM values.
