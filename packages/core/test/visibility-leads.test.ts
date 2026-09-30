import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it, vi } from "vitest";
import { extractCitations, extractText } from "../src/ai.ts";
import { DEFAULT_COMPANY_FACTS } from "../src/facts.ts";
import { HONEYPOT_FIELD, validateLeadForm } from "../src/lead-form.ts";
import {
  askPerplexity,
  detectMentions,
  engineMetrics,
  opportunities,
  parseOpenAiResponse,
  parsePerplexityResponse,
  parseSentiment,
  shareOfVoice,
  weeklyTrend,
  type CheckRow,
} from "../src/visibility.ts";
import { fixture, jsonResponse } from "./helpers.ts";

const brands = ["StaysDirect", "Stays Direct", "staysdirect.co.uk"];
const competitors = [
  "Overnightly",
  "Comfy Workers",
  "Contractors Den",
  "Rentastay",
  "Offer2Stay",
  "On Site Stays",
  "Trade Rentals",
];

describe("brand and competitor detection", () => {
  it("ranks the brand by order of first mention", () => {
    const openai = parseOpenAiResponse(fixture("ai/openai-response.json"), "gpt-5");
    const m = detectMentions(openai.text, openai.citedUrls, brands, competitors);
    expect(m).toEqual({
      brand_mentioned: true,
      brand_position: 3,
      brand_cited_url: "https://staysdirect.co.uk/",
      competitors_mentioned: ["Overnightly", "Comfy Workers"],
    });
  });

  it("matches spacing and case variants", () => {
    expect(
      detectMentions("Try stays direct or STAYS-DIRECT", [], brands, competitors).brand_mentioned
    ).toBe(true);
    expect(detectMentions("Try Staysdirectory", [], brands, competitors).brand_mentioned).toBe(
      false
    );
  });

  it("counts a citation of our domain even without a name in the text", () => {
    const m = detectMentions(
      "Overnightly is popular.",
      ["https://www.staysdirect.co.uk/contractor-accommodation/leeds"],
      brands,
      competitors
    );
    expect(m.brand_mentioned).toBe(true);
    expect(m.brand_position).toBe(2);
  });

  it("reports competitors when we are absent", () => {
    const p = parsePerplexityResponse(fixture("ai/perplexity-response.json"), "sonar");
    const m = detectMentions(p.text, p.citedUrls, brands, competitors);
    expect(m.brand_mentioned).toBe(false);
    expect(m.brand_position).toBeNull();
    expect(m.competitors_mentioned).toEqual(["Contractors Den", "Rentastay"]);
  });

  it("reads Claude web search answers", () => {
    const msg = fixture<BetaMessage>("ai/claude-web-search-message.json");
    const m = detectMentions(
      extractText(msg.content),
      extractCitations(msg.content).map((c) => c.url),
      brands,
      competitors
    );
    expect(m.brand_position).toBe(1);
    expect(m.competitors_mentioned).toEqual(["Overnightly", "On Site Stays"]);
  });
});

describe("engine response parsing", () => {
  it("parses OpenAI Responses output, citations and usage, stripping utm params", () => {
    const r = parseOpenAiResponse(fixture("ai/openai-response.json"), "gpt-5");
    expect(r.citedUrls).toEqual([
      "https://www.overnightly.co.uk/contractor-accommodation/bridgwater",
      "https://staysdirect.co.uk/",
    ]);
    expect(r.usage).toMatchObject({ provider: "openai", input_tokens: 3120, output_tokens: 210 });
    expect(r.usage.est_cost_usd).toBeGreaterThan(0);
  });

  it("parses Perplexity citations and uses the reported cost", () => {
    const r = parsePerplexityResponse(fixture("ai/perplexity-response.json"), "sonar");
    expect(r.citedUrls).toEqual([
      "https://www.contractorsden.co.uk/birmingham",
      "https://www.rentastay.co.uk/hs2",
      "https://www.hs2.org.uk/",
    ]);
    expect(r.usage.est_cost_usd).toBe(0.0051);
  });

  it("calls Perplexity with a bearer token", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(fixture("ai/perplexity-response.json"))
    );
    await askPerplexity("pplx-key", "sonar", "Contractor digs near HS2 Birmingham", fetchImpl);
    const init = fetchImpl.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer pplx-key");
    expect(JSON.parse(init.body as string).model).toBe("sonar");
  });

  it("defaults sentiment to neutral", () => {
    expect(parseSentiment({ sentiment: "positive" })).toBe("positive");
    expect(parseSentiment({ sentiment: "glowing" })).toBe("neutral");
  });
});

describe("visibility metrics", () => {
  const rows: CheckRow[] = [
    {
      run_at: "2026-09-21T05:00:00Z",
      prompt_id: "p1",
      engine: "chatgpt",
      brand_mentioned: false,
      brand_position: null,
      brand_cited_url: null,
      competitors_mentioned: ["Overnightly"],
    },
    {
      run_at: "2026-09-28T05:00:00Z",
      prompt_id: "p1",
      engine: "chatgpt",
      brand_mentioned: true,
      brand_position: 2,
      brand_cited_url: "https://staysdirect.co.uk/",
      competitors_mentioned: ["Overnightly"],
    },
    {
      run_at: "2026-09-28T05:00:00Z",
      prompt_id: "p2",
      engine: "chatgpt",
      brand_mentioned: true,
      brand_position: 1,
      brand_cited_url: null,
      competitors_mentioned: [],
    },
    {
      run_at: "2026-09-28T05:00:00Z",
      prompt_id: "p1",
      engine: "perplexity",
      brand_mentioned: false,
      brand_position: null,
      brand_cited_url: null,
      competitors_mentioned: ["Rentastay", "Overnightly"],
    },
  ];

  it("computes mention, position and citation rates per engine", () => {
    const m = engineMetrics(rows.filter((r) => r.run_at >= "2026-09-28"));
    const chatgpt = m.find((x) => x.engine === "chatgpt")!;
    expect(chatgpt).toMatchObject({
      checks: 2,
      mention_rate: 1,
      avg_position: 1.5,
      citation_rate: 0.5,
    });
    expect(m.find((x) => x.engine === "claude")).toMatchObject({
      checks: 0,
      mention_rate: 0,
      avg_position: null,
    });
  });

  it("groups a weekly trend by ISO week", () => {
    expect(weeklyTrend(rows).map((w) => [w.week, w.chatgpt])).toEqual([
      ["2026-09-21", 0],
      ["2026-09-28", 100],
    ]);
  });

  it("computes share of voice and opportunities from the latest checks", () => {
    const sov = shareOfVoice(rows, "StaysDirect");
    expect(sov[0]).toMatchObject({ name: "Overnightly", mentions: 3 });
    const opp = opportunities(rows);
    expect(opp).toHaveLength(1);
    expect(opp[0]).toMatchObject({ prompt_id: "p1", engine: "perplexity" });
  });
});

describe("public lead form", () => {
  it("accepts a valid enquiry and normalises fields", () => {
    const r = validateLeadForm({
      company_name: "Acme Civils",
      contact_name: "Sam",
      contact_email: "Sam@Acme.co.uk",
      site_postcode: "ta52ld",
      est_workers: "8",
      start_date: "2026-11-02",
      landing_page: "/contractor-accommodation/bridgwater",
      utm: { utm_source: "google", utm_medium: "cpc", evil: "x" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spam).toBe(false);
    expect(r.value).toMatchObject({
      contact_email: "sam@acme.co.uk",
      site_postcode: "TA5 2LD",
      est_workers: 8,
      utm: { utm_source: "google", utm_medium: "cpc" },
    });
  });

  it("requires a way to contact and rejects bad input", () => {
    const r = validateLeadForm({
      contact_email: "nope",
      est_workers: 0,
      start_date: "next week",
      site_postcode: "XX",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(4);
    expect(validateLeadForm({ company_name: "x" })).toEqual({
      ok: false,
      errors: ["Provide contact_email or contact_phone"],
    });
    expect(validateLeadForm([1, 2]).ok).toBe(false);
  });

  it("flags the honeypot as spam and drops off-site landing pages", () => {
    const r = validateLeadForm({
      contact_phone: DEFAULT_COMPANY_FACTS.phone,
      [HONEYPOT_FIELD]: "http://spam",
      landing_page: "https://evil.test/x",
    });
    expect(r.ok && r.spam).toBe(true);
    expect(r.ok && r.value.landing_page).toBeNull();
  });
});
