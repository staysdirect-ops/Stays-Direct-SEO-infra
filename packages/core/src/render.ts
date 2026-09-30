import type { Faq, InternalLink, Section } from "./content.ts";
import { renderMarkdown, safeHref } from "./markdown.ts";
import { canonicalUrl, HUB_PATH, jsonLdScript, SITE_URL, type PublicKind } from "./schema.ts";
import { escapeHtml } from "./text.ts";
import type { CompanyFacts } from "./types.ts";

export interface RenderablePage {
  kind: PublicKind;
  slug: string;
  title: string;
  meta_description: string;
  h1: string;
  intro: string | null;
  sections: Section[];
  /** Blog posts carry one markdown body instead of sections. */
  body_markdown?: string | null;
  faqs: Faq[];
  key_facts?: Array<{ label: string; value: string }> | null;
  internal_links: InternalLink[];
  schema_jsonld: unknown;
  updated_at?: string | null;
  published_at?: string | null;
}

export const BRAND_CSS = `
:root{--navy:#0B1F3A;--navy-2:#16325c;--orange:#F26B1D;--orange-dark:#c9530f;--ink:#1c2533;--muted:#5b6778;--line:#dde3ea;--bg:#ffffff;--soft:#f4f6f9}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.6;font-size:17px}
a{color:var(--navy-2)}
.sd-header{background:var(--navy);color:#fff}
.sd-header .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px;padding-bottom:14px}
.sd-brand{color:#fff;font-weight:800;text-decoration:none;font-size:20px}
.sd-brand span{color:var(--orange)}
.sd-phone{color:#fff;font-weight:700;text-decoration:none;white-space:nowrap}
.wrap{max-width:860px;margin:0 auto;padding-left:16px;padding-right:16px}
.crumbs{font-size:14px;color:var(--muted);margin:18px 0 0}
.crumbs a{color:var(--muted)}
h1{font-size:clamp(28px,5vw,40px);line-height:1.15;color:var(--navy);margin:14px 0 12px}
h2{font-size:clamp(22px,3.4vw,28px);color:var(--navy);margin:36px 0 10px;line-height:1.25}
h3{font-size:19px;color:var(--navy);margin:22px 0 6px}
.intro{font-size:19px;color:var(--ink)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:22px 0;padding:0;list-style:none}
.facts li{background:var(--soft);border-left:4px solid var(--orange);padding:10px 12px;border-radius:6px}
.facts b{display:block;font-size:20px;color:var(--navy)}
.facts span{font-size:14px;color:var(--muted)}
.cta{background:var(--navy);color:#fff;border-radius:10px;padding:20px;margin:28px 0}
.cta p{margin:0 0 12px}
.btn{display:inline-block;background:var(--orange);color:#fff;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:8px;margin:4px 8px 4px 0}
.btn:hover{background:var(--orange-dark)}
.btn.alt{background:transparent;border:2px solid #fff}
.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:16px}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left}
th{background:var(--soft)}
blockquote{margin:18px 0;padding:12px 16px;background:var(--soft);border-left:4px solid var(--orange);border-radius:6px}
.faq h3{margin-top:18px}
.related{border-top:1px solid var(--line);margin-top:36px;padding-top:12px}
.related ul{padding-left:18px}
footer{background:var(--soft);color:var(--muted);font-size:14px;margin-top:40px;padding:20px 0}
`;

function keyFactsHtml(facts: RenderablePage["key_facts"]): string {
  if (!facts?.length) return "";
  return `<ul class="facts">${facts
    .map((f) => `<li><b>${escapeHtml(f.value)}</b><span>${escapeHtml(f.label)}</span></li>`)
    .join("")}</ul>`;
}

function ctaHtml(facts: CompanyFacts): string {
  const tel = `tel:${facts.phone.replace(/\s/g, "")}`;
  return `<aside class="cta" aria-label="Get a quote"><p><strong>Same-day quotes for crews of any size.</strong> Whole houses with bills, Wi-Fi, council tax and cleaning included. 24/7 UK support.</p><a class="btn" href="/quote">Get a quote</a><a class="btn alt" href="${escapeHtml(tel)}">Call ${escapeHtml(facts.phone)}</a></aside>`;
}

function breadcrumbHtml(page: RenderablePage): string {
  const items: Array<[string, string]> = [["Home", "/"]];
  if (page.kind === "blog") items.push(["Blog", "/blog"]);
  else {
    items.push(["Contractor accommodation", HUB_PATH]);
    if (page.kind === "project") items.push(["Projects", `${HUB_PATH}/projects`]);
  }
  return `<nav class="crumbs" aria-label="Breadcrumb">${items
    .map(([label, href]) => `<a href="${href}">${escapeHtml(label)}</a> › `)
    .join("")}<span aria-current="page">${escapeHtml(page.h1)}</span></nav>`;
}

/** The <main> content; shared by the public renderer and the admin preview so they match exactly. */
export function renderPageMain(page: RenderablePage, facts: CompanyFacts): string {
  const sections = page.body_markdown
    ? renderMarkdown(page.body_markdown)
    : page.sections
        .map(
          (s) =>
            `<section><h2>${escapeHtml(s.heading)}</h2>\n${renderMarkdown(s.body_markdown)}</section>`
        )
        .join("\n");
  const faqs = page.faqs.length
    ? `<section class="faq"><h2>Frequently asked questions</h2>${page.faqs
        .map((f) => `<h3>${escapeHtml(f.question)}</h3>${renderMarkdown(f.answer)}`)
        .join("")}</section>`
    : "";
  const links = page.internal_links
    .map((l) => ({ ...l, href: safeHref(l.href) }))
    .filter((l): l is InternalLink => !!l.href);
  const related = links.length
    ? `<nav class="related" aria-label="Related pages"><h2>Related</h2><ul>${links
        .map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`)
        .join("")}</ul></nav>`
    : "";
  return `<main class="wrap">
${breadcrumbHtml(page)}
<article>
<h1>${escapeHtml(page.h1)}</h1>
${page.intro ? `<p class="intro">${escapeHtml(page.intro)}</p>` : ""}
${keyFactsHtml(page.key_facts)}
${ctaHtml(facts)}
${sections}
${faqs}
${ctaHtml(facts)}
</article>
${related}
</main>`;
}

export function renderPageHtml(page: RenderablePage, facts: CompanyFacts): string {
  const url = canonicalUrl(page.kind, page.slug);
  const title = escapeHtml(page.title);
  const desc = escapeHtml(page.meta_description);
  const tel = `tel:${facts.phone.replace(/\s/g, "")}`;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta name="robots" content="index,follow,max-snippet:-1">
<meta property="og:type" content="${page.kind === "blog" ? "article" : "website"}">
<meta property="og:site_name" content="${escapeHtml(facts.name)}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary">
${page.updated_at ? `<meta property="article:modified_time" content="${escapeHtml(page.updated_at)}">` : ""}
<script type="application/ld+json">${jsonLdScript(page.schema_jsonld)}</script>
<style>${BRAND_CSS}</style>
</head>
<body>
<header class="sd-header"><div class="wrap"><a class="sd-brand" href="${SITE_URL}/">Stays<span>Direct</span></a><a class="sd-phone" href="${escapeHtml(tel)}">${escapeHtml(facts.phone)}</a></div></header>
${renderPageMain(page, facts)}
<footer><div class="wrap">${escapeHtml(facts.name)} · Whole-house contractor accommodation across the UK · <a href="${escapeHtml(tel)}">${escapeHtml(facts.phone)}</a> · <a href="/quote">Get a quote</a></div></footer>
</body>
</html>`;
}

/** Row shape shared by seo_pages and blog_posts, as stored in the database. */
export interface ContentRow {
  slug: string;
  title: string | null;
  meta_description: string | null;
  h1?: string | null;
  intro?: string | null;
  sections?: Section[] | null;
  body_markdown?: string | null;
  excerpt?: string | null;
  faqs?: Faq[] | null;
  key_facts?: Array<{ label: string; value: string }> | null;
  internal_links?: InternalLink[] | null;
  schema_jsonld?: unknown;
  updated_at?: string | null;
  published_at?: string | null;
}

/** What gets frozen into published_snapshot and served publicly. */
export function toRenderable(kind: PublicKind, row: ContentRow): RenderablePage {
  return {
    kind,
    slug: row.slug,
    title: row.title ?? "",
    meta_description: row.meta_description ?? "",
    h1: row.h1 ?? row.title ?? "",
    intro: kind === "blog" ? null : (row.intro ?? null),
    sections: row.sections ?? [],
    body_markdown: kind === "blog" ? (row.body_markdown ?? "") : null,
    faqs: row.faqs ?? [],
    key_facts: row.key_facts ?? [],
    internal_links: row.internal_links ?? [],
    schema_jsonld: row.schema_jsonld ?? {},
    updated_at: row.updated_at ?? null,
    published_at: row.published_at ?? null,
  };
}

export interface HubItem {
  kind: PublicKind;
  slug: string;
  title: string;
  name: string | null;
}

/** /contractor-accommodation hub: links to every live location and project guide. */
export function renderHubHtml(items: HubItem[], facts: CompanyFacts): string {
  const locations = items
    .filter((i) => i.kind === "location")
    .sort((a, b) => (a.name ?? a.title).localeCompare(b.name ?? b.title));
  const projects = items
    .filter((i) => i.kind === "project")
    .sort((a, b) => (a.name ?? a.title).localeCompare(b.name ?? b.title));
  const list = (xs: HubItem[], label: (i: HubItem) => string) =>
    `<ul class="hub-list">${xs.map((i) => `<li><a href="${escapeHtml(canonicalUrl(i.kind, i.slug).replace(SITE_URL, ""))}">${escapeHtml(label(i))}</a></li>`).join("")}</ul>`;
  const page: RenderablePage = {
    kind: "location",
    slug: "",
    title: "Contractor Accommodation Across the UK | StaysDirect",
    meta_description: `Whole houses for contractor crews across the UK, bills included, priced per person per night. Same-day quotes on ${facts.phone}.`,
    h1: "Contractor Accommodation Across the UK",
    intro: `${facts.name} rents whole houses of ${facts.property_bedrooms_min}-${facts.property_bedrooms_max} bedrooms to construction and infrastructure crews working away from home. Bills, Wi-Fi, council tax and cleaning are included, and we quote the same day.`,
    sections: [],
    faqs: [],
    internal_links: [],
    schema_jsonld: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Contractor Accommodation Across the UK",
      url: `${SITE_URL}${HUB_PATH}`,
      publisher: {
        "@type": "Organization",
        name: facts.name,
        url: SITE_URL,
        telephone: facts.phone,
      },
    },
  };
  const body = [
    locations.length
      ? `<section><h2>Locations</h2>${list(locations, (i) => `Contractor accommodation in ${i.name ?? i.title}`)}</section>`
      : "",
    projects.length
      ? `<section><h2>Major projects</h2>${list(projects, (i) => `Accommodation near ${i.name ?? i.title}`)}</section>`
      : "",
  ].join("\n");
  return renderPageHtml(page, facts)
    .replace(
      `<link rel="canonical" href="${SITE_URL}${HUB_PATH}/">`,
      `<link rel="canonical" href="${SITE_URL}${HUB_PATH}">`
    )
    .replace(
      `<meta property="og:url" content="${SITE_URL}${HUB_PATH}/">`,
      `<meta property="og:url" content="${SITE_URL}${HUB_PATH}">`
    )
    .replace(
      /<nav class="crumbs"[\s\S]*?<\/nav>/,
      `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span aria-current="page">Contractor accommodation</span></nav>`
    )
    .replace("</article>", `${body}\n</article>`);
}
