# Website integration (staysdirect.co.uk)

The Growth Engine publishes location pages, project pages and blog posts through public, read-only Supabase Edge Functions. The main website is a separate codebase; this document says exactly what it must do. A ready-to-paste version for whoever builds the site is in [WEBSITE_INTEGRATION_PROMPT.md](WEBSITE_INTEGRATION_PROMPT.md).

Throughout, `FN` means `https://<project-ref>.supabase.co/functions/v1`.

## 1. Routes

| Site path                                   | Content                                                                                                                        | Source                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `/contractor-accommodation`                 | Hub: every live location and project page                                                                                      | `FN/public-render?path=/contractor-accommodation` or `FN/public-content?type=index` |
| `/contractor-accommodation/{slug}`          | Location page, e.g. `/contractor-accommodation/leeds`                                                                          | `type=location&slug={slug}`                                                         |
| `/contractor-accommodation/projects/{slug}` | Project page, e.g. `/contractor-accommodation/projects/hinkley-point-c`                                                        | `type=project&slug={slug}`                                                          |
| `/blog/{slug}` (fallback)                   | New posts from the engine. Keep serving the existing 18 posts as today; if a slug isn't one of yours, fall back to the engine. | `type=blog&slug={slug}`                                                             |
| `/sitemap-seo.xml`                          | Sitemap of every live engine page                                                                                              | `FN/public-sitemap`                                                                 |
| `/llms.txt`                                 | Summary for AI assistants                                                                                                      | `FN/public-llms-txt`                                                                |
| `/quote` (existing)                         | Quote form posts to `FN/public-lead`                                                                                           | see §6                                                                              |

Unknown or unpublished slugs return **404**. Pass that through as a real 404 status, not a soft 404.

## 2. The content API

All responses are public and send `Cache-Control: public, max-age=3600`. No key is needed.

```http
GET FN/public-content?type=index
```

```json
{
  "items": [
    {
      "kind": "location",
      "slug": "leeds",
      "title": "…",
      "meta_description": "…",
      "name": "Leeds",
      "updated_at": "2026-10-01T07:02:11Z",
      "path": "/contractor-accommodation/leeds",
      "url": "https://staysdirect.co.uk/contractor-accommodation/leeds"
    }
  ]
}
```

```http
GET FN/public-content?type=location&slug=leeds
GET FN/public-content?type=project&slug=hinkley-point-c      (or slug=projects/hinkley-point-c)
GET FN/public-content?type=blog&slug=how-to-house-a-crew-of-6
```

```json
{
  "kind": "location", "slug": "leeds", "path": "/contractor-accommodation/leeds",
  "canonical_url": "https://staysdirect.co.uk/contractor-accommodation/leeds",
  "title": "…(<title>, ≤60 chars)…", "meta_description": "…(≤155)…",
  "h1": "Contractor Accommodation in Leeds",
  "intro": "2–3 sentence answer-first summary (plain text)",
  "key_facts": [ { "label": "Houses within 15 miles", "value": "4" } ],
  "sections": [ { "heading": "Houses for crews near Leeds", "body_markdown": "…" } ],
  "body_markdown": null,
  "faqs": [ { "question": "…", "answer": "…" } ],
  "internal_links": [ { "kind": "town", "href": "/contractor-accommodation/bradford", "label": "…" } ],
  "schema_jsonld": { "@context": "https://schema.org", "@graph": [ … ] },
  "published_at": "…", "updated_at": "…"
}
```

Blog posts have `body_markdown` set and `sections` empty. Markdown uses `##`/`###` headings, paragraphs, `-` and `1.` lists, `**bold**`, `> ` blockquotes (the key-takeaways box), pipe tables, and links. Render it with a Markdown library that **escapes raw HTML** (for example `marked` + DOMPurify, or `react-markdown` without `rehype-raw`).

Put `schema_jsonld` in the page head as `<script type="application/ld+json">`, and use `canonical_url` for `<link rel="canonical">`.

## 3. Crawlability (required)

GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot and PerplexityBot **do not run JavaScript**. If these routes are rendered client-side in a React SPA, those bots see an empty shell and the pages are invisible to AI search. Pick one of these:

**Option A, recommended: serve the pre-rendered HTML for these routes.** `public-render` returns a complete, branded, standalone HTML document (semantic headings, title/meta, canonical, OpenGraph, JSON-LD, inline CSS, quote CTA and phone). Rewrite the routes to it for every visitor. Everyone gets the same content, so there's no cloaking question.

- Vercel (`vercel.json`):
  ```json
  {
    "rewrites": [
      {
        "source": "/contractor-accommodation",
        "destination": "https://<ref>.supabase.co/functions/v1/public-render?path=/contractor-accommodation"
      },
      {
        "source": "/contractor-accommodation/projects/:slug",
        "destination": "https://<ref>.supabase.co/functions/v1/public-render?path=/contractor-accommodation/projects/:slug"
      },
      {
        "source": "/contractor-accommodation/:slug",
        "destination": "https://<ref>.supabase.co/functions/v1/public-render?path=/contractor-accommodation/:slug"
      },
      {
        "source": "/sitemap-seo.xml",
        "destination": "https://<ref>.supabase.co/functions/v1/public-sitemap"
      },
      {
        "source": "/llms.txt",
        "destination": "https://<ref>.supabase.co/functions/v1/public-llms-txt"
      }
    ]
  }
  ```
- Netlify (`_redirects`, status 200 = proxy):
  ```
  /contractor-accommodation                     https://<ref>.supabase.co/functions/v1/public-render?path=/contractor-accommodation  200
  /contractor-accommodation/projects/:slug      https://<ref>.supabase.co/functions/v1/public-render?path=/contractor-accommodation/projects/:slug  200
  /contractor-accommodation/:slug               https://<ref>.supabase.co/functions/v1/public-render?path=/contractor-accommodation/:slug  200
  /sitemap-seo.xml                              https://<ref>.supabase.co/functions/v1/public-sitemap  200
  /llms.txt                                     https://<ref>.supabase.co/functions/v1/public-llms-txt  200
  ```
- Cloudflare in front of any host: a Worker on those paths that `fetch`es the matching `public-render` URL and returns it.

**Option B: render inside the site at build time or on the server.** If the site uses Next.js/Remix/Astro (SSR or SSG), fetch `public-content` in the route loader and render the page yourself with the site's layout. For SSG, call `type=index` to list paths and rebuild at least daily (or revalidate every hour). A pure client-side SPA (Vite + React, the Lovable default) **cannot** do this. Use Option A, or add prerendering such as `vite-plugin-ssr`/Vike or a prerender service.

**Blog fallback:** with Option A, for `/blog/{slug}` rewrite to `public-render?path=/blog/{slug}` only for slugs that aren't the site's own 18 posts (for example, handle `/blog/*` in the app and, on an unknown slug, proxy to `public-render`). With Option B, fetch `type=blog` on a miss.

### Verify

These must return the full article text (the H1, the sections and the FAQs) in the raw HTML:

```bash
curl -s -A "GPTBot" https://staysdirect.co.uk/contractor-accommodation/leeds | grep -o "<h1>[^<]*</h1>"
curl -s -A "ClaudeBot" https://staysdirect.co.uk/contractor-accommodation/leeds | grep -c "<h2>"
curl -s -A "PerplexityBot" https://staysdirect.co.uk/contractor-accommodation/projects/hinkley-point-c | grep -c "Frequently asked questions"
curl -sI https://staysdirect.co.uk/contractor-accommodation/not-a-real-town | head -1   # expect 404
```

(Use a town that has been published. Check Admin → SEO → Location pages → "live".)

## 4. Sitemaps

The live sitemap index references `https://staysdirect.co.uk/sitemap-static.xml`, which **returns 404**. Google reports this as an error and may trust the index less. Fix it:

1. Create `sitemap-static.xml` listing the site's own static pages (home, `/quote`, about, contact, services…), each with `<lastmod>`. Alternatively remove it from the index if another sitemap already covers them.
2. Add `https://staysdirect.co.uk/sitemap-seo.xml` to the sitemap index (served by the rewrite above; it lists the hub plus every live location, project and engine blog page with `lastmod`).
3. Resubmit the index in Google Search Console and Bing Webmaster Tools.

Example index:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://staysdirect.co.uk/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>https://staysdirect.co.uk/sitemap-blog.xml</loc></sitemap>
  <sitemap><loc>https://staysdirect.co.uk/sitemap-seo.xml</loc></sitemap>
</sitemapindex>
```

## 5. llms.txt and robots.txt

Serve `/llms.txt` from `public-llms-txt` (rewrite above). It describes StaysDirect, services, pricing basis, coverage, contact details and links to the top live pages, and updates itself as pages go live.

`/robots.txt` must explicitly allow the AI crawlers and list the sitemap index:

```
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: https://staysdirect.co.uk/sitemap.xml
```

(Keep any existing `Disallow` lines for private areas. Use the real sitemap-index URL.)

## 6. Quote form → `public-lead`

Post the existing quote form (and any calculator) to the engine so enquiries land in the same `leads` table as Radar leads.

```http
POST FN/public-lead
Content-Type: application/json

{
  "company_name": "Acme Civils",
  "contact_name": "Sam Smith",
  "contact_email": "sam@acme.co.uk",
  "contact_phone": "07700 900123",
  "contact_role": "Site manager",
  "site_town": "Bridgwater",
  "site_postcode": "TA6 4AA",
  "est_workers": 8,
  "start_date": "2026-11-02",
  "notes": "Two vans, need parking",
  "landing_page": "/contractor-accommodation/bridgwater",
  "utm": { "utm_source": "google", "utm_medium": "cpc", "utm_campaign": "somerset" },
  "website": "",
  "source": "seo_form"
}
```

- At least one of `contact_email` / `contact_phone` is required. `start_date` is `YYYY-MM-DD`, `est_workers` 1–1000, `site_postcode` a UK postcode.
- `landing_page`: the path the visitor first landed on (store it in `sessionStorage` on first page view). Only on-site paths are kept.
- `utm`: read `utm_*` and `gclid` from the landing URL and keep them in `sessionStorage` until submit.
- `website` is a **honeypot**. Render it visually hidden (not `display:none`; use an off-screen input with `tabindex="-1"` and `autocomplete="off"`) and send whatever it contains. Bots that fill it get `{"ok":true}` but nothing is stored.
- `source`: `"seo_form"` (default) or `"calculator"`.
- Responses: `200 {"ok":true}`; `400 {"ok":false,"errors":[…]}` (show the messages); `429` after 5 submissions per hour from one IP (show "please call 0800 088 4225").
- CORS is open, so the browser can post directly.

## 7. Footer links to the top 20 towns

Add a "Contractor accommodation" footer block linking the 20 most important live towns. Build it from `public-content?type=index` (filter `kind === "location"`, cached for an hour, at build time or on the server), in the business's priority order, falling back to alphabetical:

```html
<nav aria-label="Contractor accommodation locations">
  <h2>Contractor accommodation</h2>
  <ul>
    <li><a href="/contractor-accommodation/bridgwater">Bridgwater</a></li>
    <!-- … up to 20 … -->
  </ul>
  <a href="/contractor-accommodation">All locations</a>
</nav>
```

Also link `/contractor-accommodation` from the main navigation.

## 8. Checklist

- [ ] `/contractor-accommodation`, `/contractor-accommodation/{slug}`, `/contractor-accommodation/projects/{slug}` serve full HTML (Option A or B)
- [ ] Unknown slugs return HTTP 404
- [ ] `/blog/{slug}` falls back to the engine for unknown slugs
- [ ] `curl -A GPTBot …/contractor-accommodation/<town>` shows the full text
- [ ] `sitemap-static.xml` fixed; `sitemap-seo.xml` added to the index; resubmitted
- [ ] `/llms.txt` served
- [ ] `robots.txt` allows GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended
- [ ] Quote form posts to `public-lead` with `landing_page`, `utm` and the honeypot
- [ ] Footer links to the top 20 towns; main nav links the hub
