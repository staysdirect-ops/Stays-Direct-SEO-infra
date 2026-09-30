import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { JsonParseError, parseJsonLoose } from "./json.ts";

export type AiProvider = "anthropic" | "openai" | "perplexity";

export interface UsageEntry {
  provider: AiProvider;
  model: string;
  function_name: string;
  input_tokens: number;
  output_tokens: number;
  est_cost_usd: number;
}

/** Backed by the api_usage table in production; in-memory in tests. */
export interface UsageStore {
  spentTodayUsd(): Promise<number>;
  record(entry: UsageEntry): Promise<void>;
}

export class SpendCapExceededError extends Error {
  readonly spentUsd: number;
  readonly capUsd: number;
  constructor(spentUsd: number, capUsd: number) {
    super(`Daily AI spend cap reached: $${spentUsd.toFixed(2)} of $${capUsd.toFixed(2)}`);
    this.name = "SpendCapExceededError";
    this.spentUsd = spentUsd;
    this.capUsd = capUsd;
  }
}

export class ClaudeRefusalError extends Error {
  readonly category: string | null;
  constructor(category: string | null) {
    super(`Claude declined the request (${category ?? "unspecified"})`);
    this.name = "ClaudeRefusalError";
    this.category = category;
  }
}

/** USD per million tokens. Estimates for spend-cap enforcement, not billing. */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  sonar: { input: 1, output: 1 },
  "sonar-pro": { input: 3, output: 15 },
};
const FALLBACK_PRICING = { input: 5, output: 25 };
export const WEB_SEARCH_COST_USD = 0.01;
export const PERPLEXITY_REQUEST_FEE_USD = 0.005;

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number, extraUsd = 0): number {
  const p = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000 + extraUsd;
}

export async function assertUnderSpendCap(store: UsageStore, capUsd: number): Promise<void> {
  const spent = await store.spentTodayUsd();
  if (spent >= capUsd) throw new SpendCapExceededError(spent, capUsd);
}

export type CreateMessage = (params: MessageCreateParamsNonStreaming) => Promise<BetaMessage>;

export function anthropicCreateMessage(apiKey: string): CreateMessage {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000 });
  return (params) => client.beta.messages.create(params);
}

export interface ClaudeContext {
  createMessage: CreateMessage;
  model: string;
  usage: UsageStore;
  capUsd: number;
  functionName: string;
}

export interface CallClaudeOptions {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  model?: string;
  webSearch?: { maxUses: number };
}

export interface WebCitation {
  url: string;
  title: string | null;
}

export interface ClaudeResult<T = unknown> {
  text: string;
  data: T | undefined;
  citations: WebCitation[];
  costUsd: number;
  model: string;
}

const MODELS_WITH_SERVER_FALLBACK = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"];
const MAX_PAUSE_RESUMES = 3;

export async function callClaude<T = unknown>(ctx: ClaudeContext, opts: CallClaudeOptions): Promise<ClaudeResult<T>> {
  await assertUnderSpendCap(ctx.usage, ctx.capUsd);
  const model = opts.model ?? ctx.model;
  const messages: BetaMessageParam[] = [{ role: "user", content: opts.user }];
  let costUsd = 0;

  const send = async (): Promise<BetaMessage> => {
    let resumes = 0;
    for (;;) {
      const params: MessageCreateParamsNonStreaming = {
        model,
        max_tokens: opts.maxTokens ?? 8000,
        system: opts.system,
        messages,
      };
      if (opts.effort && !model.startsWith("claude-haiku")) params.output_config = { effort: opts.effort };
      if (opts.webSearch) {
        params.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: opts.webSearch.maxUses }];
      }
      if (MODELS_WITH_SERVER_FALLBACK.includes(model)) {
        params.betas = ["server-side-fallback-2026-07-01"];
        params.fallbacks = "default";
      }
      const msg = await ctx.createMessage(params);
      const searches = msg.usage.server_tool_use?.web_search_requests ?? 0;
      const cost = estimateCostUsd(msg.model || model, msg.usage.input_tokens, msg.usage.output_tokens, searches * WEB_SEARCH_COST_USD);
      costUsd += cost;
      await ctx.usage.record({
        provider: "anthropic",
        model: msg.model || model,
        function_name: ctx.functionName,
        input_tokens: msg.usage.input_tokens,
        output_tokens: msg.usage.output_tokens,
        est_cost_usd: cost,
      });
      if (msg.stop_reason === "refusal") throw new ClaudeRefusalError(msg.stop_details?.category ?? null);
      if (msg.stop_reason === "pause_turn" && resumes < MAX_PAUSE_RESUMES) {
        resumes++;
        messages.push({ role: "assistant", content: msg.content as BetaContentBlockParam[] });
        continue;
      }
      return msg;
    }
  };

  let msg = await send();
  let text = extractText(msg.content);
  let data: T | undefined;
  if (opts.json) {
    try {
      data = parseJsonLoose<T>(text);
    } catch (err) {
      if (!(err instanceof JsonParseError)) throw err;
      messages.push({ role: "assistant", content: msg.content as BetaContentBlockParam[] });
      messages.push({ role: "user", content: "That was not valid JSON. Reply with only the JSON object, no prose or code fences." });
      msg = await send();
      text = extractText(msg.content);
      data = parseJsonLoose<T>(text);
    }
  }
  return { text, data, citations: extractCitations(msg.content), costUsd, model: msg.model || model };
}

export function extractText(content: BetaContentBlock[]): string {
  return content
    .filter((b): b is Extract<BetaContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export function extractCitations(content: BetaContentBlock[]): WebCitation[] {
  const seen = new Map<string, WebCitation>();
  for (const block of content) {
    if (block.type === "text") {
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location" && !seen.has(c.url)) seen.set(c.url, { url: c.url, title: c.title });
      }
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result" && !seen.has(r.url)) seen.set(r.url, { url: r.url, title: r.title });
      }
    }
  }
  return [...seen.values()];
}

/** In-memory store for tests and local scripts. */
export function memoryUsageStore(initialSpendUsd = 0): UsageStore & { entries: UsageEntry[] } {
  const entries: UsageEntry[] = [];
  return {
    entries,
    async spentTodayUsd() {
      return initialSpendUsd + entries.reduce((s, e) => s + e.est_cost_usd, 0);
    },
    async record(e) {
      entries.push(e);
    },
  };
}
