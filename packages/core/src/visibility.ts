import {
  estimateCostUsd,
  PERPLEXITY_REQUEST_FEE_USD,
  WEB_SEARCH_COST_USD,
  type UsageEntry,
} from "./ai.ts";
import { fetchWithRetry, HttpError, type FetchLike } from "./http.ts";

export type Engine = "chatgpt" | "claude" | "perplexity";
export const ENGINES: Engine[] = ["chatgpt", "claude", "perplexity"];

export interface EngineAnswer {
  text: string;
  citedUrls: string[];
  model: string;
  usage: Omit<UsageEntry, "function_name">;
}

export interface MentionResult {
  brand_mentioned: boolean;
  /** 1-based rank of the brand among all tracked names, by first appearance. */
  brand_position: number | null;
  brand_cited_url: string | null;
  competitors_mentioned: string[];
}

function nameRegex(name: string): RegExp {
  const parts = name
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![A-Za-z0-9])${parts.join("[\\s-]*")}(?![A-Za-z0-9])`, "i");
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstIndex(text: string, names: string[]): number {
  let best = -1;
  for (const n of names) {
    const m = nameRegex(n).exec(text);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

export function detectMentions(
  text: string,
  citedUrls: string[],
  brandNames: string[],
  competitorNames: string[]
): MentionResult {
  const brandKeys = brandNames.map(nameKey);
  const brandIdx = firstIndex(text, brandNames);
  const brandCited =
    citedUrls.find((u) => {
      const d = nameKey(domainOf(u));
      return brandKeys.some((k) => k && d.includes(k.replace(/couk$/, "")));
    }) ?? null;
  const competitors = competitorNames
    .map((name) => ({ name, idx: firstIndex(text, [name]) }))
    .filter((c) => c.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  const mentioned = brandIdx >= 0 || !!brandCited;
  let position: number | null = null;
  if (brandIdx >= 0) position = 1 + competitors.filter((c) => c.idx < brandIdx).length;
  else if (brandCited) position = competitors.length + 1;
  return {
    brand_mentioned: mentioned,
    brand_position: position,
    brand_cited_url: brandCited,
    competitors_mentioned: competitors.map((c) => c.name),
  };
}

export const VISIBILITY_SYSTEM =
  "You are a helpful assistant. Answer the user's question about UK accommodation options, naming specific companies or websites where relevant, and cite sources.";

export function openAiRequest(model: string, prompt: string) {
  return {
    model,
    input: prompt,
    instructions: VISIBILITY_SYSTEM,
    tools: [{ type: "web_search" }],
  };
}

export function perplexityRequest(model: string, prompt: string) {
  return {
    model,
    messages: [
      { role: "system", content: VISIBILITY_SYSTEM },
      { role: "user", content: prompt },
    ],
  };
}

interface OpenAiResponse {
  model?: string;
  output?: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<{ type: string; url?: string }>;
    }>;
  }>;
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function parseOpenAiResponse(body: OpenAiResponse, requestedModel: string): EngineAnswer {
  const texts: string[] = [];
  const urls = new Set<string>();
  let searches = 0;
  for (const item of body.output ?? []) {
    if (item.type === "web_search_call") searches++;
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && c.text) texts.push(c.text);
      for (const a of c.annotations ?? [])
        if (a.type === "url_citation" && a.url) urls.add(stripUtm(a.url));
    }
  }
  const text = texts.join("\n").trim() || body.output_text || "";
  const model = body.model ?? requestedModel;
  const input = body.usage?.input_tokens ?? 0;
  const output = body.usage?.output_tokens ?? 0;
  return {
    text,
    citedUrls: [...urls],
    model,
    usage: {
      provider: "openai",
      model,
      input_tokens: input,
      output_tokens: output,
      est_cost_usd: estimateCostUsd(model, input, output, searches * WEB_SEARCH_COST_USD * 2.5),
    },
  };
}

interface PerplexityResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  citations?: string[];
  search_results?: Array<{ url?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: { total_cost?: number } };
}

export function parsePerplexityResponse(
  body: PerplexityResponse,
  requestedModel: string
): EngineAnswer {
  const urls = new Set<string>();
  for (const u of body.citations ?? []) urls.add(stripUtm(u));
  for (const r of body.search_results ?? []) if (r.url) urls.add(stripUtm(r.url));
  const model = body.model ?? requestedModel;
  const input = body.usage?.prompt_tokens ?? 0;
  const output = body.usage?.completion_tokens ?? 0;
  const reported = body.usage?.cost?.total_cost;
  return {
    text: body.choices?.[0]?.message?.content?.trim() ?? "",
    citedUrls: [...urls],
    model,
    usage: {
      provider: "perplexity",
      model,
      input_tokens: input,
      output_tokens: output,
      est_cost_usd:
        typeof reported === "number"
          ? reported
          : estimateCostUsd(model, input, output, PERPLEXITY_REQUEST_FEE_USD),
    },
  };
}

function stripUtm(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

export async function askOpenAi(
  apiKey: string,
  model: string,
  prompt: string,
  fetchImpl?: FetchLike
): Promise<EngineAnswer> {
  const res = await fetchWithRetry(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(openAiRequest(model, prompt)),
    },
    { retries: 2, fetchImpl }
  );
  const body = await res.text();
  if (!res.ok) throw new HttpError(res.status, "openai/responses", body);
  return parseOpenAiResponse(JSON.parse(body) as OpenAiResponse, model);
}

export async function askPerplexity(
  apiKey: string,
  model: string,
  prompt: string,
  fetchImpl?: FetchLike
): Promise<EngineAnswer> {
  const res = await fetchWithRetry(
    "https://api.perplexity.ai/chat/completions",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(perplexityRequest(model, prompt)),
    },
    { retries: 2, fetchImpl }
  );
  const body = await res.text();
  if (!res.ok) throw new HttpError(res.status, "perplexity/chat", body);
  return parsePerplexityResponse(JSON.parse(body) as PerplexityResponse, model);
}

export const SENTIMENT_SYSTEM =
  'Classify how the answer portrays the named brand. Return ONLY JSON: {"sentiment": "positive"|"neutral"|"negative"}';

export function parseSentiment(raw: unknown): "positive" | "neutral" | "negative" {
  const s = (raw as { sentiment?: unknown } | null)?.sentiment;
  return s === "positive" || s === "negative" ? s : "neutral";
}

export interface CheckRow {
  run_at: string;
  prompt_id: string;
  engine: Engine;
  brand_mentioned: boolean;
  brand_position: number | null;
  brand_cited_url: string | null;
  competitors_mentioned: string[];
}

export interface EngineMetrics {
  engine: Engine;
  checks: number;
  mention_rate: number;
  avg_position: number | null;
  citation_rate: number;
}

export function engineMetrics(rows: CheckRow[]): EngineMetrics[] {
  return ENGINES.map((engine) => {
    const r = rows.filter((x) => x.engine === engine);
    const mentioned = r.filter((x) => x.brand_mentioned);
    const positions = mentioned.map((x) => x.brand_position).filter((p): p is number => p != null);
    return {
      engine,
      checks: r.length,
      mention_rate: r.length ? mentioned.length / r.length : 0,
      avg_position: positions.length
        ? positions.reduce((a, b) => a + b, 0) / positions.length
        : null,
      citation_rate: r.length ? r.filter((x) => x.brand_cited_url).length / r.length : 0,
    };
  });
}

/** ISO week start (Monday, UTC) for grouping runs. */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function weeklyTrend(rows: CheckRow[]): Array<{ week: string } & Record<Engine, number>> {
  const weeks = [...new Set(rows.map((r) => weekStart(r.run_at)))].sort();
  return weeks.map((week) => {
    const inWeek = rows.filter((r) => weekStart(r.run_at) === week);
    const entry = { week } as { week: string } & Record<Engine, number>;
    for (const m of engineMetrics(inWeek)) entry[m.engine] = Math.round(m.mention_rate * 1000) / 10;
    return entry;
  });
}

export function shareOfVoice(
  rows: CheckRow[],
  brandLabel: string
): Array<{ name: string; mentions: number; share: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.brand_mentioned) counts.set(brandLabel, (counts.get(brandLabel) ?? 0) + 1);
    for (const c of r.competitors_mentioned) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .map(([name, mentions]) => ({ name, mentions, share: total ? mentions / total : 0 }))
    .sort((a, b) => b.mentions - a.mentions);
}

/** Latest check per prompt+engine where a competitor appears and we don't. */
export function opportunities(rows: CheckRow[]): CheckRow[] {
  const latest = new Map<string, CheckRow>();
  for (const r of rows) {
    const k = `${r.prompt_id}:${r.engine}`;
    const prev = latest.get(k);
    if (!prev || r.run_at > prev.run_at) latest.set(k, r);
  }
  return [...latest.values()].filter(
    (r) => !r.brand_mentioned && r.competitors_mentioned.length > 0
  );
}
