import { describe, expect, it } from "vitest";
import {
  contractsFinderSearchUrl,
  dedupeKey,
  dedupeProjects,
  findATenderSearchUrl,
  ingestWindow,
  isAwardRelease,
  mapRelease,
  ocdsDate,
  passesFilter,
  type IngestedProject,
  type OcdsReleasePackage,
} from "../src/ocds.ts";
import { fixture } from "./helpers.ts";

const cf = fixture<OcdsReleasePackage>("contracts-finder-search.json");
const cf2 = fixture<OcdsReleasePackage>("contracts-finder-search-page2.json");
const fts = fixture<OcdsReleasePackage>("find-a-tender-packages.json");

const mapAll = (source: "contracts_finder" | "find_a_tender", pkg: OcdsReleasePackage) =>
  (pkg.releases ?? []).map((r) => mapRelease(source, r)).filter((p): p is IngestedProject => !!p);

const filter = { minValueGbp: 500_000, cpvPrefixes: ["45", "71", "50", "51", "65", "76"] };

describe("Contracts Finder mapping", () => {
  const projects = mapAll("contracts_finder", cf);
  const a39 = projects.find((p) => p.title.startsWith("A39"))!;

  it("maps every award release in the page", () => {
    expect(projects).toHaveLength(5);
  });

  it("maps title, buyer, supplier, value and dates", () => {
    expect(a39.source).toBe("contracts_finder");
    expect(a39.source_id).toBe("contracts_finder:ocds-b5fd17-7f3c2a1e-4b6d-4c1a-9d2e-1a2b3c4d5e6f");
    expect(a39.buyer_name).toBe("Somerset Council");
    expect(a39.buyer_postcode).toBe("TA1 4DY");
    expect(a39.supplier_name).toBe("Kier Highways Limited");
    expect(a39.supplier_companies_house_number).toBe("01234567");
    expect(a39.supplier_address).toContain("M50 3XP");
    expect(a39.value_gbp).toBe(6_150_000);
    expect(a39.award_date).toBe("2026-09-19");
    expect(a39.start_date).toBe("2026-11-02");
    expect(a39.end_date).toBe("2027-12-31");
    expect(a39.duration_months).toBe(14);
    expect(a39.source_url).toBe(
      "https://www.contractsfinder.service.gov.uk/Notice/7f3c2a1e-4b6d-4c1a-9d2e-1a2b3c4d5e6f"
    );
  });

  it("collects CPV codes from main and additional classifications", () => {
    expect(a39.cpv_codes).toEqual(expect.arrayContaining(["45233142", "45232452"]));
  });

  it("captures delivery addresses and postcodes separately from the buyer office", () => {
    expect(a39.delivery_postcodes).toEqual(["TA5 2LD"]);
    expect(a39.delivery_text).toContain("Cannington");
  });

  it("handles Scottish Companies House numbers and unknown values", () => {
    const rail = projects.find((p) => p.title.startsWith("Cumbrian"))!;
    expect(rail.supplier_companies_house_number).toBe("SC123456");
    const water = projects.find((p) => p.title.startsWith("Lowestoft"))!;
    expect(water.value_gbp).toBeNull();
    expect(water.cpv_codes).toEqual(["45252127", "51000000"]);
  });

  it("pads short Companies House numbers to 8 digits", () => {
    const consult = projects.find((p) => p.title.startsWith("Transport"))!;
    expect(consult.supplier_companies_house_number).toBe("09876543");
    expect(mapAll("contracts_finder", cf2)[0]!.supplier_companies_house_number).toBe("03456789");
  });
});

describe("Find a Tender mapping", () => {
  const projects = mapAll("find_a_tender", fts);

  it("drops tender-stage releases (queried without stages)", () => {
    const tenderOnly = fts.releases!.find((r) => r.id === "031245-2026")!;
    expect(isAwardRelease(tenderOnly)).toBe(false);
    expect(projects.some((p) => p.title.startsWith("A66"))).toBe(false);
  });

  it("prefers contract period and award value, falling back to amountGross", () => {
    const sella = projects.find((p) => p.raw.id === "031877-2026")!;
    expect(sella.value_gbp).toBe(96_000_000);
    expect(sella.start_date).toBe("2026-10-05");
    expect(sella.end_date).toBe("2030-10-04");
    expect(sella.duration_months).toBe(48);
    expect(sella.delivery_postcodes).toEqual(["CA20 1PG"]);
    expect(sella.source_url).toBe("https://www.find-tender.service.gov.uk/Notice/031877-2026");
    expect(sella.cpv_codes).toEqual(expect.arrayContaining(["45220000", "71300000"]));
  });

  it("ignores non-GBP values", () => {
    const pipes = projects.find((p) => p.title.startsWith("Supply of Ductile"))!;
    expect(pipes.value_gbp).toBeNull();
  });

  it("derives duration from durationInDays for Procurement Act contract notices", () => {
    const szc = projects.find((p) => p.title.startsWith("Sizewell C"))!;
    expect(szc.duration_months).toBe(24);
    expect(szc.cpv_codes).toEqual(["50230000"]);
  });
});

describe("relevance filter", () => {
  const all = [...mapAll("contracts_finder", cf), ...mapAll("find_a_tender", fts)];
  const kept = all.filter((p) => passesFilter(p, filter)).map((p) => p.title);

  it("keeps construction CPVs above the minimum value", () => {
    expect(kept).toContain("A39 Bridgwater to Cannington Resurfacing and Drainage Improvements");
    expect(kept).toContain("Sellafield Site Civils Framework Lot 2 - Remediation Enabling Works");
    expect(kept).toContain("Sizewell C Two Village Bypass Maintenance and Drainage Package");
  });

  it("keeps relevant CPVs when the value is unknown", () => {
    expect(kept).toContain("Lowestoft Water Recycling Centre Capacity Upgrade");
  });

  it("drops consultancy, supply-only and small contracts", () => {
    expect(kept).not.toContain("Transport Strategy Advisory Services");
    expect(kept).not.toContain("Supply of Ductile Iron Pipes");
    expect(kept).not.toContain("Depot Roof Repairs");
  });
});

describe("dedupe", () => {
  const cfProjects = mapAll("contracts_finder", cf);
  const ftsProjects = mapAll("find_a_tender", fts);
  const empty = { ocids: new Set<string>(), dedupeKeys: new Set<string>(), sourceIds: new Set<string>() };

  it("normalises title, supplier and value into the key", () => {
    expect(dedupeKey("A39 Resurfacing", "Kier Highways Limited", 6_150_000)).toBe(
      dedupeKey("a39  resurfacing", "KIER HIGHWAYS LTD", 6_150_400)
    );
  });

  it("collapses releases with the same ocid to the latest one", () => {
    const out = dedupeProjects(ftsProjects, empty);
    const sella = out.filter((p) => p.ocid === "ocds-h6vhtk-04c9d8");
    expect(sella).toHaveLength(1);
    expect(sella[0]!.raw.id).toBe("031877-2026");
  });

  it("drops a Find a Tender notice already ingested from Contracts Finder", () => {
    const existing = {
      ocids: new Set(cfProjects.map((p) => p.ocid)),
      dedupeKeys: new Set(cfProjects.map((p) => p.dedupe_key)),
      sourceIds: new Set(cfProjects.map((p) => p.source_id)),
    };
    const out = dedupeProjects(ftsProjects, existing);
    expect(out.some((p) => p.title.startsWith("A39"))).toBe(false);
    expect(out.some((p) => p.title.startsWith("Sellafield"))).toBe(true);
  });

  it("drops cross-source duplicates within one batch", () => {
    const out = dedupeProjects([...cfProjects, ...ftsProjects], empty);
    expect(out.filter((p) => p.title.startsWith("A39"))).toHaveLength(1);
  });

  it("lets same-source updates through so they upsert", () => {
    const a39 = cfProjects.find((p) => p.title.startsWith("A39"))!;
    const existing = { ocids: new Set([a39.ocid]), dedupeKeys: new Set([a39.dedupe_key]), sourceIds: new Set([a39.source_id]) };
    expect(dedupeProjects([a39], existing)).toHaveLength(1);
  });
});

describe("search URLs and windows", () => {
  it("builds the Contracts Finder award search with a cursor", () => {
    const u = new URL(contractsFinderSearchUrl("2026-09-20T00:00:00", "2026-09-23T00:00:00", "MTAw"));
    expect(u.searchParams.get("stages")).toBe("award");
    expect(u.searchParams.get("limit")).toBe("100");
    expect(u.searchParams.get("cursor")).toBe("MTAw");
  });

  it("never passes stages to Find a Tender", () => {
    const u = new URL(findATenderSearchUrl("2026-09-20T00:00:00", "2026-09-23T00:00:00"));
    expect(u.searchParams.has("stages")).toBe(false);
    expect(u.searchParams.get("updatedFrom")).toBe("2026-09-20T00:00:00");
  });

  it("uses 3 days on first run, last success with overlap after, and backfill when asked", () => {
    const now = new Date("2026-09-30T06:00:00Z");
    expect(ingestWindow(now, null).from.toISOString()).toBe("2026-09-27T06:00:00.000Z");
    expect(ingestWindow(now, new Date("2026-09-29T06:00:00Z")).from.toISOString()).toBe("2026-09-29T05:00:00.000Z");
    expect(ingestWindow(now, new Date("2026-09-29T06:00:00Z"), 90).from.toISOString()).toBe("2026-07-02T06:00:00.000Z");
    expect(ocdsDate(now)).toBe("2026-09-30T06:00:00");
  });
});
