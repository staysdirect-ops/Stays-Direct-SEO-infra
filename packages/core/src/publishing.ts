import type { InternalLink } from "./content.ts";
import { haversineMiles } from "./geo.ts";
import { canonicalUrl, HUB_PATH, publicPath, SITE_URL, type PublicKind } from "./schema.ts";
import { escapeHtml } from "./text.ts";
import type { CompanyFacts, LatLng } from "./types.ts";

export interface SitemapEntry {
  loc: string;
  lastmod?: string | null;
}

export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const lastmod = e.lastmod ? `<lastmod>${escapeHtml(e.lastmod.slice(0, 10))}</lastmod>` : "";
      return `<url><loc>${escapeHtml(e.loc)}</loc>${lastmod}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export interface PublishedIndexItem {
  kind: PublicKind;
  slug: string;
  title: string;
  updated_at: string | null;
}

export function sitemapEntries(items: PublishedIndexItem[]): SitemapEntry[] {
  const latest = items.reduce<string | null>(
    (m, i) => (i.updated_at && (!m || i.updated_at > m) ? i.updated_at : m),
    null
  );
  const hub: SitemapEntry[] = items.some((i) => i.kind !== "blog")
    ? [{ loc: `${SITE_URL}${HUB_PATH}`, lastmod: latest }]
    : [];
  return [
    ...hub,
    ...items.map((i) => ({ loc: canonicalUrl(i.kind, i.slug), lastmod: i.updated_at })),
  ];
}

export function llmsTxt(args: {
  facts: CompanyFacts;
  locations: PublishedIndexItem[];
  projects: PublishedIndexItem[];
  blog: PublishedIndexItem[];
  townCount: number;
}): string {
  const f = args.facts;
  const link = (i: PublishedIndexItem) =>
    `- [${i.title.replace(/\s*[|–-]\s*StaysDirect$/i, "")}](${canonicalUrl(i.kind, i.slug)})`;
  return `# ${f.name}

> ${f.name} rents whole houses (${f.property_bedrooms_min}-${f.property_bedrooms_max} bedrooms) to construction and infrastructure contractor crews working away from home anywhere in the UK. Bills, Wi-Fi, council tax and cleaning are included and prices are per person per night (pppn).

## Services
- Whole-house accommodation for contractor crews, booked weekly or monthly
- ${f.name} is the direct operator: no agency markup
- Same-day quotes and 24/7 UK support
- Credit terms of ${f.credit_terms_days_min}-${f.credit_terms_days_max} days for approved business accounts
- Typically ${f.hotel_saving_pct_min}-${f.hotel_saving_pct_max}% cheaper than hotels for crews

## Pricing basis
Priced per person per night, with ${f.included.join(", ")} included. Each location page lists local "from" prices.

## Coverage
UK-wide.${args.locations.length ? ` Location guides cover ${args.locations.length} towns and cities.` : ""}

## Contact
- Phone: ${f.phone}
- Quote: ${SITE_URL}/quote
- Website: ${SITE_URL}${f.email ? `\n- Email: ${f.email}` : ""}

## Location guides
${args.locations.slice(0, 40).map(link).join("\n") || "- Coming soon"}

## Major project guides
${args.projects.slice(0, 20).map(link).join("\n") || "- Coming soon"}

## Guides for project managers
${args.blog.slice(0, 20).map(link).join("\n") || "- Coming soon"}
`;
}

export interface LinkCandidateTown extends LatLng {
  slug: string;
  name: string;
}

/** 3-5 nearest published towns, related project pages, 2 blog posts, and /quote. */
export function pickInternalLinks(args: {
  from: LatLng | null;
  selfPath: string;
  towns: LinkCandidateTown[];
  projects: Array<LatLng & { slug: string; name: string }>;
  blog: Array<{ slug: string; title: string }>;
  maxProjectMiles?: number;
}): InternalLink[] {
  const links: InternalLink[] = [];
  const self = args.selfPath;
  const from = args.from;
  const byDistance = <T extends LatLng>(xs: T[]) =>
    from
      ? [...xs].map((x) => ({ x, d: haversineMiles(from, x) })).sort((a, b) => a.d - b.d)
      : xs.map((x) => ({ x, d: 0 }));

  for (const { x } of byDistance(args.towns)
    .filter(({ x }) => publicPath("location", x.slug) !== self)
    .slice(0, 5)) {
    links.push({
      kind: "town",
      href: publicPath("location", x.slug),
      label: `Contractor accommodation in ${x.name}`,
    });
  }
  for (const { x } of byDistance(args.projects)
    .filter(
      ({ x, d }) => publicPath("project", x.slug) !== self && d <= (args.maxProjectMiles ?? 40)
    )
    .slice(0, 3)) {
    links.push({
      kind: "project",
      href: publicPath("project", x.slug),
      label: `Accommodation near ${x.name}`,
    });
  }
  for (const b of args.blog.slice(0, 2)) {
    links.push({ kind: "blog", href: publicPath("blog", b.slug), label: b.title });
  }
  links.push({ kind: "quote", href: "/quote", label: "Get a same-day quote" });
  return links;
}
