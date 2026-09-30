import type { Faq } from "./content.ts";
import type { CompanyFacts } from "./types.ts";

export const SITE_URL = "https://staysdirect.co.uk";
export const HUB_PATH = "/contractor-accommodation";

export type PublicKind = "location" | "project" | "blog";

export function publicPath(kind: PublicKind, slug: string): string {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  if (kind === "blog") return `/blog/${clean.replace(/^blog\//, "")}`;
  if (kind === "project") return `${HUB_PATH}/projects/${clean.replace(/^projects\//, "")}`;
  return `${HUB_PATH}/${clean}`;
}

export function canonicalUrl(kind: PublicKind, slug: string): string {
  return `${SITE_URL}${publicPath(kind, slug)}`;
}

function organization(facts: CompanyFacts) {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: facts.name,
    url: SITE_URL,
    telephone: facts.phone,
    ...(facts.email ? { email: facts.email } : {}),
  };
}

function faqPage(url: string, faqs: Faq[]) {
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

function breadcrumbs(items: Array<{ name: string; url: string }>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

export function locationSchema(args: {
  townName: string;
  county: string | null;
  slug: string;
  description: string;
  faqs: Faq[];
  fromPppn: number | null;
  facts: CompanyFacts;
}) {
  const url = canonicalUrl("location", args.slug);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(args.facts),
      {
        "@type": ["LodgingBusiness", "LocalBusiness"],
        "@id": `${url}#business`,
        name: `${args.facts.name} - Contractor Accommodation in ${args.townName}`,
        url,
        description: args.description,
        telephone: args.facts.phone,
        parentOrganization: { "@id": `${SITE_URL}/#organization` },
        areaServed: {
          "@type": "City",
          name: args.townName,
          ...(args.county ? { containedInPlace: { "@type": "AdministrativeArea", name: args.county } } : {}),
        },
        ...(args.fromPppn ? { priceRange: `From £${args.fromPppn} per person per night` } : {}),
        amenityFeature: args.facts.included.map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })),
      },
      faqPage(url, args.faqs),
      breadcrumbs([
        { name: "Home", url: SITE_URL },
        { name: "Contractor Accommodation", url: `${SITE_URL}${HUB_PATH}` },
        { name: args.townName, url },
      ]),
    ],
  };
}

export function projectSchema(args: {
  projectName: string;
  slug: string;
  description: string;
  faqs: Faq[];
  nearestTown: string | null;
  facts: CompanyFacts;
}) {
  const url = canonicalUrl("project", args.slug);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(args.facts),
      {
        "@type": ["LodgingBusiness", "LocalBusiness"],
        "@id": `${url}#business`,
        name: `${args.facts.name} - Accommodation near ${args.projectName}`,
        url,
        description: args.description,
        telephone: args.facts.phone,
        parentOrganization: { "@id": `${SITE_URL}/#organization` },
        areaServed: args.nearestTown ? { "@type": "City", name: args.nearestTown } : { "@type": "Country", name: "United Kingdom" },
      },
      faqPage(url, args.faqs),
      breadcrumbs([
        { name: "Home", url: SITE_URL },
        { name: "Contractor Accommodation", url: `${SITE_URL}${HUB_PATH}` },
        { name: "Projects", url: `${SITE_URL}${HUB_PATH}/projects` },
        { name: args.projectName, url },
      ]),
    ],
  };
}

export function blogSchema(args: {
  title: string;
  slug: string;
  description: string;
  faqs: Faq[];
  publishedAt: string | null;
  updatedAt: string | null;
  facts: CompanyFacts;
}) {
  const url = canonicalUrl("blog", args.slug);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(args.facts),
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: args.title,
        description: args.description,
        mainEntityOfPage: url,
        author: { "@id": `${SITE_URL}/#organization` },
        publisher: { "@id": `${SITE_URL}/#organization` },
        ...(args.publishedAt ? { datePublished: args.publishedAt } : {}),
        ...(args.updatedAt ? { dateModified: args.updatedAt } : {}),
      },
      ...(args.faqs.length ? [faqPage(url, args.faqs)] : []),
      breadcrumbs([
        { name: "Home", url: SITE_URL },
        { name: "Blog", url: `${SITE_URL}/blog` },
        { name: args.title, url },
      ]),
    ],
  };
}

/** JSON for a <script type="application/ld+json"> block; neutralises "</script>" breakouts. */
export function jsonLdScript(schema: unknown): string {
  return JSON.stringify(schema).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
