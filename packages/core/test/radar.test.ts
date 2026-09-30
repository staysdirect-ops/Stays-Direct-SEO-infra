import { describe, expect, it } from "vitest";
import { callClaude, memoryUsageStore } from "../src/ai.ts";
import { buildEnrichPrompt, statusFromEnrichment, validateEnrichment, type EnrichmentInput } from "../src/enrich.ts";
import { DEFAULT_COMPANY_FACTS, DEFAULT_BRAND_VOICE, OPT_OUT_LINE } from "../src/facts.ts";
import { mapRelease, type OcdsReleasePackage } from "../src/ocds.ts";
import { buildOutreachPrompt, buildOutreachSystem, templateOutreach, validateOutreach, type OutreachInput } from "../src/outreach.ts";
import { wordCount } from "../src/text.ts";
import { fakeClaude, fixture, fixtureText } from "./helpers.ts";

const cf = fixture<OcdsReleasePackage>("contracts-finder-search.json");
const a39 = mapRelease("contracts_finder", cf.releases![0]!)!;
const lowestoft = mapRelease("contracts_finder", cf.releases![4]!)!;

describe("enrichment", () => {
  it("builds a prompt with the notice details and delivery location", () => {
    const p = buildEnrichPrompt(a39);
    expect(p).toContain("A39 Bridgwater to Cannington");
    expect(p).toContain("TA5 2LD");
    expect(p).toContain("office postcode TA1 4DY");
    expect(p).toContain("£6.2m");
  });

  it("accepts a postcode that appears in the notice", () => {
    const e = validateEnrichment(fixture("ai/claude-enrich-a39.json"), a39);
    expect(e.site_postcode).toBe("TA5 2LD");
    expect(e.location_confidence).toBe("high");
    expect(statusFromEnrichment(e)).toBe("qualified");
  });

  it("discards an invented postcode, downgrades confidence and fixes worker ranges", async () => {
    const fake = fakeClaude([fixtureText("ai/claude-enrich-invented-postcode.json")]);
    const r = await callClaude(
      { createMessage: fake.createMessage, model: "claude-sonnet-5-5", usage: memoryUsageStore(), capUsd: 10, functionName: "radar-enrich" },
      { system: "s", user: buildEnrichPrompt(lowestoft), json: true }
    );
    const e = validateEnrichment(r.data, lowestoft as EnrichmentInput);
    expect(e.site_postcode).toBeNull();
    expect(e.location_confidence).toBe("medium");
    expect(e.est_workers_min).toBe(25);
    expect(e.est_workers_max).toBe(40);
    expect(e.est_workers_away_from_home).toBe(40);
    expect(statusFromEnrichment(e)).toBe("qualified");
  });

  it("rejects irrelevant work and sends low-confidence locations to review", () => {
    const consult = mapRelease("contracts_finder", cf.releases![2]!)!;
    const e = validateEnrichment(fixture("ai/claude-enrich-consultancy.json"), consult);
    expect(statusFromEnrichment(e)).toBe("rejected");
    expect(statusFromEnrichment({ is_relevant: true, location_confidence: "low" })).toBe("needs_review");
  });

  it("falls back to notice dates and clamps unknown enums", () => {
    const e = validateEnrichment({ is_relevant: true, project_type: "spaceport", location_confidence: "certain" }, a39);
    expect(e.project_type).toBe("other");
    expect(e.location_confidence).toBe("low");
    expect(e.start_date).toBe("2026-11-02");
    expect(e.duration_months).toBe(14);
  });
});

describe("outreach drafts", () => {
  const input: OutreachInput = {
    project_title: a39.title,
    site_town: "Cannington",
    supplier_name: a39.supplier_name,
    start_date: "2026-11-02",
    est_workers_away_from_home: 18,
    radius_miles: 25,
    matches: [
      { town: "Cannington", bedrooms: 6, max_guests: 6, pppn_from: 29.5, van_parking: true, distance_miles: 0.8, available_from: null },
      { town: "Bridgwater", bedrooms: 5, max_guests: 5, pppn_from: 32, van_parking: true, distance_miles: 3.2, available_from: null },
    ],
    facts: DEFAULT_COMPANY_FACTS,
    brand_voice: DEFAULT_BRAND_VOICE,
  };

  it("gives Claude the matched facts and the rules", () => {
    const prompt = JSON.parse(buildOutreachPrompt(input));
    expect(prompt).toMatchObject({ our_houses_within_radius: 2, nearest_house_miles: 0.8, from_price_pppn_gbp: 29.5 });
    const sys = buildOutreachSystem(DEFAULT_BRAND_VOICE, DEFAULT_COMPANY_FACTS);
    expect(sys).toContain("0800 088 4225");
    expect(sys).toContain(OPT_OUT_LINE);
  });

  it("accepts a compliant draft without flags", () => {
    const d = validateOutreach(fixture("ai/claude-outreach-a39.json"), input);
    expect(d.flags).toEqual([]);
    expect(d.outreach_body.endsWith(OPT_OUT_LINE)).toBe(true);
    expect(d.outreach_body.split(OPT_OUT_LINE)).toHaveLength(2);
    expect(wordCount(d.outreach_body)).toBeLessThanOrEqual(130);
    expect(d.linkedin_message.length).toBeLessThanOrEqual(300);
    expect(d.call_script.split("\n")).toHaveLength(5);
  });

  it("appends the opt-out line and flags invented numbers and missing phone", () => {
    const d = validateOutreach(
      { outreach_subject: "Hi", outreach_body: "We have 9 houses ready tomorrow near the site.", linkedin_message: "x".repeat(400), call_script: ["a", "b"] },
      input
    );
    expect(d.outreach_body.endsWith(OPT_OUT_LINE)).toBe(true);
    expect(d.flags).toEqual(expect.arrayContaining(["draft_missing_phone", "draft_unverified_numbers", "call_script_incomplete"]));
    expect(d.linkedin_message.length).toBeLessThanOrEqual(300);
  });

  it("builds a template draft when AI is unavailable, without claiming stock it lacks", () => {
    const t = templateOutreach({ ...input, matches: [] });
    expect(t.flags).toEqual(["draft_from_template"]);
    expect(t.outreach_body).toContain("We can source whole houses near Cannington");
    expect(t.outreach_body).toContain(OPT_OUT_LINE);
    expect(t.outreach_body).toContain("0800 088 4225");
  });
});
