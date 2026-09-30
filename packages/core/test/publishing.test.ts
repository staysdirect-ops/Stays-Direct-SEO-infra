import { describe, expect, it } from "vitest";
import { pageMarkdown, validatePageDraft } from "../src/content.ts";
import { DEFAULT_COMPANY_FACTS } from "../src/facts.ts";
import { renderMarkdown, safeHref } from "../src/markdown.ts";
import { llmsTxt, sitemapEntries, sitemapXml } from "../src/publishing.ts";
import { renderPageHtml, renderPageMain, type RenderablePage } from "../src/render.ts";
import {
  blogSchema,
  canonicalUrl,
  jsonLdScript,
  locationSchema,
  publicPath,
} from "../src/schema.ts";
import { fixture } from "./helpers.ts";

const facts = DEFAULT_COMPANY_FACTS;

describe("markdown renderer", () => {
  it("renders headings, lists, emphasis, blockquotes and tables", () => {
    const html = renderMarkdown(
      "## Costs\n\nFrom **£29.50** *pppn*.\n\n- one\n- two\n\n1. first\n2. second\n\n> **Key takeaways**\n> - short\n\n| A | B |\n|---|---|\n| 1 | 2 |"
    );
    expect(html).toContain("<h2>Costs</h2>");
    expect(html).toContain("<strong>£29.50</strong> <em>pppn</em>");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
    expect(html).toContain(
      "<blockquote><p><strong>Key takeaways</strong></p>\n<ul><li>short</li></ul></blockquote>"
    );
    expect(html).toContain(
      '<table><thead><tr><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
    );
  });

  it("escapes HTML and drops unsafe links", () => {
    const html = renderMarkdown(
      "<script>alert(1)</script> [x](javascript:alert(1)) [y](/quote) [z](https://gov.uk/a) <img src=x onerror=1>"
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<a href="/quote">y</a>');
    expect(html).toContain('<a href="https://gov.uk/a" rel="noopener" target="_blank">z</a>');
    expect(safeHref("//evil.test")).toBeNull();
    expect(safeHref("tel:0800 088 4225")).toBe("tel:08000884225");
  });
});

describe("paths and schema", () => {
  it("maps kinds to public paths", () => {
    expect(publicPath("location", "leeds")).toBe("/contractor-accommodation/leeds");
    expect(publicPath("project", "projects/hs2-euston")).toBe(
      "/contractor-accommodation/projects/hs2-euston"
    );
    expect(publicPath("blog", "crew-guide")).toBe("/blog/crew-guide");
    expect(canonicalUrl("location", "leeds")).toBe(
      "https://staysdirect.co.uk/contractor-accommodation/leeds"
    );
  });

  it("builds LodgingBusiness, FAQPage and BreadcrumbList for locations", () => {
    const s = locationSchema({
      townName: "Leeds",
      county: "West Yorkshire",
      slug: "leeds",
      description: "d",
      faqs: [{ question: "q", answer: "a" }],
      fromPppn: 29.5,
      facts,
    });
    const types = s["@graph"].map((g) => (g as { "@type": unknown })["@type"]);
    expect(types).toEqual([
      "Organization",
      ["LodgingBusiness", "LocalBusiness"],
      "FAQPage",
      "BreadcrumbList",
    ]);
    expect(JSON.stringify(s)).toContain('"areaServed":{"@type":"City","name":"Leeds"');
  });

  it("builds Article + FAQPage for blog posts", () => {
    const s = blogSchema({
      title: "t",
      slug: "s",
      description: "d",
      faqs: [{ question: "q", answer: "a" }],
      publishedAt: "2026-09-01",
      updatedAt: null,
      facts,
    });
    expect(s["@graph"].map((g) => (g as { "@type": string })["@type"])).toContain("Article");
  });

  it("escapes </script> inside JSON-LD", () => {
    expect(jsonLdScript({ a: "</script><script>x" })).not.toContain("</script>");
  });
});

describe("public HTML renderer", () => {
  const draft = validatePageDraft(
    fixture("ai/claude-location-page.json"),
    "Contractor Accommodation in Bridgwater"
  );
  const page: RenderablePage = {
    kind: "location",
    slug: "bridgwater",
    title: draft.title,
    meta_description: draft.meta_description,
    h1: draft.h1,
    intro: draft.intro,
    sections: draft.sections,
    faqs: draft.faqs,
    key_facts: [{ label: "Houses within 15 miles", value: "3" }],
    internal_links: [
      { kind: "quote", href: "/quote", label: "Get a same-day quote" },
      { kind: "town", href: "javascript:x", label: "bad" },
    ],
    schema_jsonld: locationSchema({
      townName: "Bridgwater",
      county: "Somerset",
      slug: "bridgwater",
      description: draft.meta_description,
      faqs: draft.faqs,
      fromPppn: 29.5,
      facts,
    }),
    updated_at: "2026-09-30T07:00:00Z",
  };
  const html = renderPageHtml(page, facts);

  it("is a complete standalone document with SEO tags", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="en-GB">');
    expect(html).toContain("<title>Contractor Accommodation in Bridgwater | StaysDirect</title>");
    expect(html).toContain(
      '<link rel="canonical" href="https://staysdirect.co.uk/contractor-accommodation/bridgwater">'
    );
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('href="tel:08000884225"');
    expect(html).toContain('href="/quote"');
    expect(html).not.toContain("javascript:x");
  });

  it("contains the full page text for crawlers that don't run JavaScript", () => {
    for (const s of draft.sections)
      expect(html).toContain(`<h2>${s.heading.replace(/'/g, "&#39;")}</h2>`);
    expect(html).toContain("Frequently asked questions");
    expect(html).toContain("£15,960");
  });

  it("uses the same main content as the admin preview", () => {
    expect(html).toContain(renderPageMain(page, facts));
    expect(pageMarkdown(draft).length).toBeGreaterThan(1000);
  });
});

describe("sitemap and llms.txt", () => {
  const items = [
    {
      kind: "location" as const,
      slug: "leeds",
      title: "Contractor Accommodation in Leeds",
      updated_at: "2026-09-29T10:00:00Z",
    },
    {
      kind: "project" as const,
      slug: "hinkley-point-c",
      title: "Accommodation near Hinkley Point C",
      updated_at: "2026-09-30T10:00:00Z",
    },
    {
      kind: "blog" as const,
      slug: "crew-of-6",
      title: "How to House a Crew of 6 & More",
      updated_at: null,
    },
  ];

  it("lists the hub and every published page with lastmod, XML-escaped", () => {
    const xml = sitemapXml(sitemapEntries(items));
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(
      "<loc>https://staysdirect.co.uk/contractor-accommodation</loc><lastmod>2026-09-30</lastmod>"
    );
    expect(xml).toContain(
      "<loc>https://staysdirect.co.uk/contractor-accommodation/leeds</loc><lastmod>2026-09-29</lastmod>"
    );
    expect(xml).toContain("<loc>https://staysdirect.co.uk/blog/crew-of-6</loc></url>");
  });

  it("writes llms.txt with services, pricing basis, contact and top pages", () => {
    const txt = llmsTxt({
      facts,
      locations: [items[0]!],
      projects: [items[1]!],
      blog: [items[2]!],
      townCount: 150,
    });
    expect(txt.startsWith("# StaysDirect\n\n> ")).toBe(true);
    for (const h of [
      "## Services",
      "## Pricing basis",
      "## Coverage",
      "## Contact",
      "## Location guides",
    ])
      expect(txt).toContain(h);
    expect(txt).toContain("0800 088 4225");
    expect(txt).toContain(
      "- [Contractor Accommodation in Leeds](https://staysdirect.co.uk/contractor-accommodation/leeds)"
    );
  });
});

describe("hub page and snapshots", () => {
  it("links every live location and project with a clean canonical", async () => {
    const { renderHubHtml, toRenderable } = await import("../src/render.ts");
    const html = renderHubHtml(
      [
        {
          kind: "location",
          slug: "leeds",
          title: "Contractor Accommodation in Leeds",
          name: "Leeds",
        },
        { kind: "location", slug: "bridgwater", title: "x", name: "Bridgwater" },
        { kind: "project", slug: "projects/hinkley-point-c", title: "y", name: "Hinkley Point C" },
      ],
      facts
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://staysdirect.co.uk/contractor-accommodation">'
    );
    expect(html.indexOf("/contractor-accommodation/bridgwater")).toBeLessThan(
      html.indexOf("/contractor-accommodation/leeds")
    );
    expect(html).toContain(
      'href="/contractor-accommodation/projects/hinkley-point-c">Accommodation near Hinkley Point C</a>'
    );
    const snap = toRenderable("blog", {
      slug: "s",
      title: "T",
      meta_description: "d",
      body_markdown: "Hello",
      intro: "ignored",
    });
    expect(snap).toMatchObject({
      kind: "blog",
      h1: "T",
      intro: null,
      body_markdown: "Hello",
      sections: [],
    });
  });
});
