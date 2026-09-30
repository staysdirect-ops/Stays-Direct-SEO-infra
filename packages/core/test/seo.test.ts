import { describe, expect, it } from "vitest";
import {
  blogMarkdown,
  buildLocationPagePrompt,
  pageMarkdown,
  titleOverlap,
  validateBlogDraft,
  validatePageDraft,
  validateReview,
  validateTopics,
} from "../src/content.ts";
import {
  allowedNumbers,
  buildLocationDataPack,
  buildProjectDataPack,
  costComparison,
  dataPackHash,
  type PropertyRow,
  type ProjectRow,
  type TownRow,
} from "../src/datapack.ts";
import { DEFAULT_COMPANY_FACTS, factNumbers } from "../src/facts.ts";
import {
  checkQuality,
  extractFactNumbers,
  findBannedPhrases,
  statusFromQuality,
} from "../src/quality.ts";
import { pickInternalLinks } from "../src/publishing.ts";
import { fixture } from "./helpers.ts";

interface Inputs {
  town: TownRow;
  towns: TownRow[];
  properties: PropertyRow[];
  projects: ProjectRow[];
  hinkley: Parameters<typeof buildProjectDataPack>[0]["project"];
}
const inputs = fixture<Inputs>("seo/inputs.json");
const facts = DEFAULT_COMPANY_FACTS;
const locationPack = buildLocationDataPack({
  town: inputs.town,
  properties: inputs.properties,
  projects: inputs.projects,
  facts,
});
const projectPack = buildProjectDataPack({
  project: inputs.hinkley,
  properties: inputs.properties,
  towns: inputs.towns,
  facts,
});

describe("location data pack", () => {
  it("includes only bookable properties within 15 miles, nearest first", () => {
    expect(locationPack.properties.count).toBe(3);
    expect(locationPack.properties.nearest.map((p) => p.town)).toEqual([
      "Bridgwater",
      "North Petherton",
      "Cannington",
    ]);
    expect(locationPack.properties.from_pppn).toBe(29.5);
    expect(locationPack.properties.bedrooms_min).toBe(4);
    expect(locationPack.properties.bedrooms_max).toBe(6);
    expect(locationPack.properties.with_van_parking).toBe(2);
  });

  it("includes qualified projects within 20 miles, largest first", () => {
    expect(locationPack.projects.items.map((p) => p.title)).toEqual([
      "Hinkley Point C Marine Works Support Package",
      "A39 Bridgwater to Cannington Resurfacing and Drainage Improvements",
    ]);
  });

  it("computes the crew-of-6 comparison over 4 and 12 weeks", () => {
    const c = locationPack.cost_comparison!;
    expect(c.crew_size).toBe(6);
    expect(c.periods[0]).toEqual({
      weeks: 4,
      nights: 28,
      hotel_total: 15960,
      house_total: 4956,
      saving: 11004,
      saving_pct: 69,
    });
    expect(c.periods[1]!.hotel_total).toBe(47880);
  });

  it("omits the comparison without a hotel rate or local stock", () => {
    expect(costComparison(null, 30)).toBeNull();
    expect(costComparison(90, null)).toBeNull();
    expect(costComparison(30, 45)).toBeNull();
  });

  it("hash is stable and changes when the data changes", () => {
    const again = buildLocationDataPack({
      town: inputs.town,
      properties: [...inputs.properties].reverse(),
      projects: inputs.projects,
      facts,
    });
    expect(dataPackHash(again)).toBe(dataPackHash(locationPack));
    const cheaper = buildLocationDataPack({
      town: inputs.town,
      properties: inputs.properties.map((p) => (p.id === "p2" ? { ...p, pppn_from: 28 } : p)),
      projects: inputs.projects,
      facts,
    });
    expect(dataPackHash(cheaper)).not.toBe(dataPackHash(locationPack));
  });

  it("an occupied property counts once it is free by the requested date", () => {
    const pack = buildLocationDataPack({
      town: inputs.towns[1]!,
      properties: inputs.properties,
      projects: [],
      facts,
    });
    expect(pack.properties.nearest.some((p) => p.town === "Taunton")).toBe(false);
  });
});

describe("project data pack", () => {
  it("groups nearby houses by town with distances to the site", () => {
    expect(projectPack.towns.map((t) => [t.name, t.distance_miles])).toEqual([
      ["Cannington", 5.1],
      ["Bridgwater", 7.2],
      ["North Petherton", 9.6],
    ]);
    expect(projectPack.crew_planning[0]).toEqual({
      crew_size: 6,
      houses_needed: 2,
      bedrooms_per_house: 5,
    });
    expect(projectPack.cost_comparison?.hotel_pppn).toBe(85);
  });
});

describe("number verification", () => {
  const allowed = allowedNumbers(locationPack);

  it("allows pack numbers, their roundings and company facts", () => {
    for (const n of [29.5, 15960, 11004, 69, 0.7, 7.9, 24, 6.15, 6.2, 41276, 39])
      expect(allowed.has(n)).toBe(true);
    for (const n of factNumbers(facts)) expect(allowed.has(n)).toBe(true);
  });

  it("extracts numbers with currency, commas and decimals, ignoring list markers and URLs", () => {
    const got = extractFactNumbers(
      "1. Call us\n2. Book\n\nFrom £29.50 and £15,960 over 4 weeks. [link](/x/2024) https://a.test/99"
    );
    expect(got.map((g) => g.value)).toEqual([29.5, 15960, 4]);
  });
});

describe("quality checker on generated pages", () => {
  const draft = validatePageDraft(
    fixture("ai/claude-location-page.json"),
    "Contractor Accommodation in Bridgwater"
  );
  const md = pageMarkdown(draft);

  it("passes the Bridgwater location page", () => {
    const q = checkQuality({
      kind: "location",
      title: draft.title,
      metaDescription: draft.meta_description,
      bodyMarkdown: md,
      faqCount: draft.faqs.length,
      allowedNumbers: allowedNumbers(locationPack),
      maxSimilarity: 0.21,
      aiReview: validateReview(fixture("ai/claude-review.json")),
    });
    expect(q.unverifiedNumbers).toEqual([]);
    expect(q.bannedPhrases).toEqual([]);
    expect(q.wordCount).toBeGreaterThanOrEqual(700);
    expect(q.wordCount).toBeLessThanOrEqual(1200);
    expect(q.score).toBeGreaterThanOrEqual(70);
    expect(statusFromQuality(q.score)).toBe("in_review");
  });

  it("passes the Hinkley Point C project page", () => {
    const p = validatePageDraft(
      fixture("ai/claude-project-page.json"),
      "Accommodation near Hinkley Point C"
    );
    const q = checkQuality({
      kind: "project",
      title: p.title,
      metaDescription: p.meta_description,
      bodyMarkdown: pageMarkdown(p),
      faqCount: p.faqs.length,
      allowedNumbers: allowedNumbers(projectPack),
    });
    expect(q.notes).toEqual([]);
    expect(q.score).toBe(100);
  });

  it("passes the blog post using only company facts and topic numbers", () => {
    const b = validateBlogDraft(fixture("ai/claude-blog-post.json"), "x");
    const allowed = new Set([...factNumbers(facts), 6]);
    const q = checkQuality({
      kind: "blog",
      title: b.title,
      metaDescription: b.meta_description,
      bodyMarkdown: blogMarkdown(b),
      faqCount: b.faqs.length,
      allowedNumbers: allowed,
    });
    expect(q.notes).toEqual([]);
    expect(q.score).toBe(100);
  });

  it("blocks review when a number is not in the data pack", () => {
    const tampered = md.replace(
      "from £29.50 per person per night, bills included",
      "from £19.99 per person per night, bills included"
    );
    const q = checkQuality({
      kind: "location",
      title: draft.title,
      metaDescription: draft.meta_description,
      bodyMarkdown: tampered,
      faqCount: draft.faqs.length,
      allowedNumbers: allowedNumbers(locationPack),
      aiReview: { score: 100, issues: [] },
    });
    expect(q.unverifiedNumbers).toEqual(["19.99"]);
    expect(q.score).toBeLessThan(70);
    expect(statusFromQuality(q.score)).toBe("draft");
  });

  it("penalises banned phrases, thin FAQs, long titles and near-duplicates", () => {
    const q = checkQuality({
      kind: "location",
      title: "A".repeat(70),
      metaDescription: "B".repeat(170),
      bodyMarkdown: `${md}\n\nNestled in a vibrant town, look no further.`,
      faqCount: 3,
      allowedNumbers: allowedNumbers(locationPack),
      maxSimilarity: 0.62,
      mostSimilarSlug: "taunton",
    });
    expect(q.bannedPhrases).toEqual(["nestled", "vibrant", "look no further"]);
    expect(q.notes.some((n) => n.includes("FAQs"))).toBe(true);
    expect(q.notes.some((n) => n.includes("taunton"))).toBe(true);
    expect(q.score).toBeLessThan(70);
  });

  it("blocks near-copies even when everything else is fine", () => {
    const base = {
      kind: "location" as const,
      title: draft.title,
      metaDescription: draft.meta_description,
      bodyMarkdown: md,
      faqCount: draft.faqs.length,
      allowedNumbers: allowedNumbers(locationPack),
    };
    expect(checkQuality({ ...base, maxSimilarity: 0.6 }).score).toBe(75);
    expect(
      checkQuality({ ...base, maxSimilarity: 0.95, mostSimilarSlug: "taunton" }).score
    ).toBeLessThan(70);
  });

  it("does not flag words that merely contain a banned phrase", () => {
    expect(findBannedPhrases("The unlocking mechanism")).toEqual([]);
    expect(findBannedPhrases("Unlock savings")).toEqual(["unlock"]);
  });
});

describe("prompts, drafts and topics", () => {
  it("forces the exact H1 and tolerates malformed sections", () => {
    const d = validatePageDraft(
      {
        h1: "Wrong",
        sections: [{ heading: "Ok", body_markdown: "x" }, { heading: "" }, null],
        faqs: "nope",
      },
      "Contractor Accommodation in Leeds"
    );
    expect(d.h1).toBe("Contractor Accommodation in Leeds");
    expect(d.sections).toHaveLength(1);
    expect(d.faqs).toEqual([]);
  });

  it("omits the projects section instruction when there are no projects", () => {
    const empty = buildLocationDataPack({
      town: inputs.towns[5]!,
      properties: [],
      projects: [],
      facts,
    });
    const p = buildLocationPagePrompt(empty, [{ kind: "quote", href: "/quote", label: "Quote" }]);
    expect(p).not.toContain("Major projects near");
    expect(p).toContain("without any figures");
  });

  it("dedupes topic ideas against existing titles and each other", () => {
    const topics = validateTopics(fixture("ai/claude-topics.json"), [
      "How to house a construction crew of 6: a practical guide",
    ]);
    expect(topics.map((t) => t.working_title)).toEqual([
      "Travel and subsistence for site crews: what project managers should know",
      "Van parking when your crew works away: a checklist",
    ]);
    expect(titleOverlap("contractor-accommodation-leeds", "leeds-contractor-accommodation")).toBe(
      1
    );
  });
});

describe("internal links", () => {
  it("links the nearest towns, nearby projects, 2 blog posts and the quote page", () => {
    const links = pickInternalLinks({
      from: inputs.town,
      selfPath: "/contractor-accommodation/bridgwater",
      towns: inputs.towns,
      projects: [
        { slug: "hinkley-point-c", name: "Hinkley Point C", lat: 51.2089, lng: -3.1334 },
        { slug: "hs2-euston", name: "HS2 Euston", lat: 51.528, lng: -0.1337 },
      ],
      blog: [
        { slug: "a", title: "A" },
        { slug: "b", title: "B" },
        { slug: "c", title: "C" },
      ],
    });
    const towns = links.filter((l) => l.kind === "town");
    expect(towns).toHaveLength(5);
    expect(towns[0]!.href).toBe("/contractor-accommodation/burnham-on-sea");
    expect(towns.some((l) => l.href.endsWith("/bridgwater"))).toBe(false);
    expect(links.filter((l) => l.kind === "project").map((l) => l.href)).toEqual([
      "/contractor-accommodation/projects/hinkley-point-c",
    ]);
    expect(links.filter((l) => l.kind === "blog")).toHaveLength(2);
    expect(links.at(-1)).toEqual({ kind: "quote", href: "/quote", label: "Get a same-day quote" });
  });
});
