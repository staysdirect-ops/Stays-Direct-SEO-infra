// Checks the mappers against real responses captured by `.github/workflows/live-samples.yml`
// (tests/fixtures/live). Assertions are about shape, not exact values, so refreshed samples pass.
import { describe, expect, it } from "vitest";
import { geocodePostcode } from "../src/geo.ts";
import {
  describeRegion,
  isAwardRelease,
  mapRelease,
  passesFilter,
  projectTitle,
  type OcdsReleasePackage,
} from "../src/ocds.ts";
import { blogTitlesFromSitemap } from "../src/publishing.ts";
import { fixture, fixtureText } from "./helpers.ts";

const FILTER = { minValueGbp: 100_000, cpvPrefixes: ["45", "71", "50", "51", "65", "76"] };
const CH = /^([A-Z]{2}\d{6}|\d{8})$/;

const sources = [
  {
    source: "contracts_finder" as const,
    host: "https://www.contractsfinder.service.gov.uk/Notice/",
    pkg: fixture<OcdsReleasePackage>("live/contracts_finder-sample.json"),
  },
  {
    source: "find_a_tender" as const,
    host: "https://www.find-tender.service.gov.uk/Notice/",
    pkg: fixture<OcdsReleasePackage>("live/find_a_tender-sample.json"),
  },
];

describe.each(sources)("live $source sample", ({ source, host, pkg }) => {
  const releases = pkg.releases ?? [];
  const awards = releases.filter(isAwardRelease);
  const mapped = awards.map((r) => mapRelease(source, r));

  it("has award releases and maps every one of them", () => {
    expect(awards.length).toBeGreaterThan(5);
    for (const p of mapped) expect(p).not.toBeNull();
  });

  it("ignores non-award releases", () => {
    for (const r of releases.filter((r) => !isAwardRelease(r)))
      expect(mapRelease(source, r)).toBeNull();
  });

  it("produces well-formed fields", () => {
    for (const p of mapped) {
      if (!p) continue;
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.title).not.toMatch(/^lot\s*\d/i);
      expect(p.title).not.toMatch(/award$/i);
      expect(p.source_url.startsWith(host)).toBe(true);
      expect(p.source_url).not.toContain("/Attachment/");
      expect(p.supplier_name).toBeTruthy();
      if (p.supplier_companies_house_number) expect(p.supplier_companies_house_number).toMatch(CH);
      for (const d of [p.award_date, p.start_date, p.end_date])
        if (d) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (p.value_gbp !== null) expect(p.value_gbp).toBeGreaterThan(0);
      if (p.duration_months !== null) expect(p.duration_months).toBeGreaterThanOrEqual(1);
      for (const c of p.cpv_codes) expect(c).toMatch(/^\d{2,8}$/);
      for (const pc of p.delivery_postcodes)
        expect(pc).toMatch(/^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/);
      // NUTS/ITL codes are named, never passed on bare.
      if (p.delivery_text) expect(p.delivery_text).not.toMatch(/(^|[;,] )(UK|TL)[C-N]\w*(;|,|$)/);
    }
  });

  it("finds some relevant projects with the default filter", () => {
    expect(mapped.filter((p) => p && passesFilter(p, FILTER)).length).toBeGreaterThan(0);
  });

  it("uses the notice link the source publishes when there is one", () => {
    for (const r of awards) {
      const doc = (r.awards ?? [])
        .flatMap((a) => a.documents ?? [])
        .find((d) => d.documentType === "awardNotice" && d.url?.startsWith(host));
      if (doc) expect(mapRelease(source, r)!.source_url).toBe(doc.url);
    }
  });
});

describe("live sample specifics", () => {
  it("builds Contracts Finder links from the release id, not the ocid", () => {
    const r = sources[0]!.pkg.releases!.find(isAwardRelease)!;
    const guid = r.id.slice(0, 36);
    const stripped = { ...r, awards: r.awards!.map((a) => ({ ...a, documents: [] })) };
    expect(mapRelease("contracts_finder", stripped)!.source_url).toBe(
      `https://www.contractsfinder.service.gov.uk/Notice/${guid}`
    );
  });

  it("combines lot-only award titles with the tender title", () => {
    expect(
      projectTitle("SBC Minor Works Framework", { title: "Lot 1: Mechanical Services" }, [])
    ).toBe("SBC Minor Works Framework: Lot 1: Mechanical Services");
    expect(projectTitle("CSSP", { title: "CSSP" })).toBe("CSSP");
    expect(projectTitle("Aids and Adaptations", { title: null, relatedLots: ["1"] }, [])).toBe(
      "Aids and Adaptations"
    );
    expect(
      projectTitle("Roads", { title: null, relatedLots: ["2"] }, [
        { id: "2", title: "Resurfacing" },
      ])
    ).toBe("Roads: Resurfacing");
    expect(projectTitle(null, { title: "Only award" })).toBe("Only award");
    expect(projectTitle("Rainbows Extension Main Works - AWARD", { title: null })).toBe(
      "Rainbows Extension Main Works"
    );
  });

  it("names NUTS and ITL regions without guessing finer areas", () => {
    expect(describeRegion("UKD33")).toBe("UKD33 (North West England)");
    expect(describeRegion("UKK")).toBe("South West England");
    expect(describeRegion("TLI")).toBe("London");
    expect(describeRegion("UK")).toBe("United Kingdom (nationwide)");
    expect(describeRegion("Somerset")).toBe("Somerset");
    expect(describeRegion("  ")).toBeNull();
  });

  it("reads the live postcodes.io response", async () => {
    const body = fixtureText("live/postcodes-io-single.json");
    const fetchImpl = async () =>
      new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    const r = await geocodePostcode("LS1 1UR", { fetchImpl });
    expect(r?.lat).toBeCloseTo(53.8, 1);
    expect(r?.lng).toBeCloseTo(-1.55, 1);
  });

  it("reads existing blog titles from the live sitemap, skipping the bare /blog", () => {
    const titles = blogTitlesFromSitemap(fixtureText("live/sitemap-blog.xml"));
    expect(titles.length).toBeGreaterThan(3);
    expect(titles).toContain("contractor accommodation cost uk 2026");
    expect(titles).not.toContain("blog");
  });
});
