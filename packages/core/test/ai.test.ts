import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it } from "vitest";
import {
  callClaude,
  ClaudeRefusalError,
  estimateCostUsd,
  memoryUsageStore,
  SpendCapExceededError,
  type ClaudeContext,
} from "../src/ai.ts";
import { JsonParseError } from "../src/json.ts";
import { fakeClaude, fixture, fixtureText, textMessage } from "./helpers.ts";

function ctx(responses: Parameters<typeof fakeClaude>[0], spent = 0, cap = 10) {
  const fake = fakeClaude(responses);
  const usage = memoryUsageStore(spent);
  const c: ClaudeContext = { createMessage: fake.createMessage, model: "claude-sonnet-5-5", usage, capUsd: cap, functionName: "test" };
  return { ctx: c, fake, usage };
}

describe("callClaude", () => {
  it("refuses to call once today's spend reaches the cap", async () => {
    const { ctx: c, fake } = ctx(["{}"], 10, 10);
    await expect(callClaude(c, { system: "s", user: "u" })).rejects.toBeInstanceOf(SpendCapExceededError);
    expect(fake.calls).toHaveLength(0);
  });

  it("logs usage with an estimated cost", async () => {
    const { ctx: c, usage } = ctx(["hello"]);
    const r = await callClaude(c, { system: "s", user: "u" });
    expect(r.text).toBe("hello");
    expect(usage.entries).toHaveLength(1);
    expect(usage.entries[0]).toMatchObject({ provider: "anthropic", function_name: "test", input_tokens: 1000, output_tokens: 500 });
    expect(usage.entries[0]!.est_cost_usd).toBeCloseTo(estimateCostUsd("claude-sonnet-5-5", 1000, 500), 6);
  });

  it("parses fenced JSON", async () => {
    const { ctx: c } = ctx([fixtureText("ai/claude-enrich-invented-postcode.json")]);
    const r = await callClaude<{ site_town: string }>(c, { system: "s", user: "u", json: true });
    expect(r.data?.site_town).toBe("Lowestoft");
  });

  it("retries once with a correction when JSON is invalid", async () => {
    const { ctx: c, fake } = ctx(["Sure! Here it is: not json", '{"ok": true}']);
    const r = await callClaude<{ ok: boolean }>(c, { system: "s", user: "u", json: true });
    expect(r.data).toEqual({ ok: true });
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.messages).toHaveLength(3);
    expect(fake.calls[1]!.messages[2]!.role).toBe("user");
  });

  it("gives up after the single JSON retry", async () => {
    const { ctx: c } = ctx(["nope", "still nope"]);
    await expect(callClaude(c, { system: "s", user: "u", json: true })).rejects.toBeInstanceOf(JsonParseError);
  });

  it("throws a typed error on refusal and still records usage", async () => {
    const refusal = textMessage("", { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } } as Partial<BetaMessage>);
    const { ctx: c, usage } = ctx([refusal]);
    await expect(callClaude(c, { system: "s", user: "u" })).rejects.toBeInstanceOf(ClaudeRefusalError);
    expect(usage.entries).toHaveLength(1);
  });

  it("opts into server-side fallback on supported models only", async () => {
    const a = ctx(["x"]);
    await callClaude(a.ctx, { system: "s", user: "u", effort: "low" });
    expect(a.fake.calls[0]).toMatchObject({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "low" } });
    const b = ctx(["x"]);
    await callClaude(b.ctx, { system: "s", user: "u", model: "claude-haiku-4-5", effort: "low" });
    expect(b.fake.calls[0]!.fallbacks).toBeUndefined();
    expect(b.fake.calls[0]!.output_config).toBeUndefined();
  });

  it("adds the web search tool, resumes pause_turn and collects citations", async () => {
    const paused = textMessage("", { stop_reason: "pause_turn" });
    const final = fixture<BetaMessage>("ai/claude-web-search-message.json");
    const { ctx: c, fake, usage } = ctx([paused, final]);
    const r = await callClaude(c, { system: "s", user: "u", webSearch: { maxUses: 3 } });
    expect(fake.calls[0]!.tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 3 }]);
    expect(fake.calls).toHaveLength(2);
    expect(r.text).toContain("StaysDirect rents 4-8 bedroom houses");
    expect(r.citations.map((x) => x.url)).toEqual(["https://staysdirect.co.uk/", "https://www.overnightly.co.uk/"]);
    expect(usage.entries[1]!.est_cost_usd).toBeGreaterThan(estimateCostUsd("claude-sonnet-5-5", 5400, 180));
  });
});
