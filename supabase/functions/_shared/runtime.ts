import "./dev-proxy.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  anthropicCreateMessage,
  DEFAULT_BRAND_VOICE,
  mergeCompanyFacts,
  type ClaudeContext,
  type Settings,
  type UsageEntry,
  type UsageStore,
} from "./core/index.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

export function env(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new HttpError(500, `Missing required secret ${name}`);
  return v;
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let client: SupabaseClient | null = null;
/** Service-role client: bypasses RLS, so every entry point must authorise the caller first. */
export function db(): SupabaseClient {
  client ??= createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Throws on a PostgREST error and returns data. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export async function loadSettings(): Promise<Settings & { crons_enabled: boolean }> {
  const row = must(await db().from("settings").select("*").eq("id", 1).single(), "load settings") as Record<string, unknown>;
  return {
    brand_voice: (row.brand_voice as string) || DEFAULT_BRAND_VOICE,
    company_facts: mergeCompanyFacts(row.company_facts as Settings["company_facts"]),
    claude_model: row.claude_model as string,
    claude_cheap_model: row.claude_cheap_model as string,
    openai_model: row.openai_model as string,
    perplexity_model: row.perplexity_model as string,
    radar_min_value_gbp: Number(row.radar_min_value_gbp),
    radar_match_radius_miles: Number(row.radar_match_radius_miles),
    radar_cpv_prefixes: row.radar_cpv_prefixes as string[],
    seo_pages_per_day: Number(row.seo_pages_per_day),
    blog_posts_per_week: Number(row.blog_posts_per_week),
    daily_ai_spend_cap_usd: Number(row.daily_ai_spend_cap_usd),
    tracked_brand_names: row.tracked_brand_names as string[],
    competitor_names: row.competitor_names as string[],
    crons_enabled: row.crons_enabled === true,
  };
}

export const usageStore: UsageStore = {
  async spentTodayUsd() {
    const { data, error } = await db().rpc("ai_spend_today_usd");
    if (error) throw new Error(`ai_spend_today_usd: ${error.message}`);
    return Number(data ?? 0);
  },
  async record(e: UsageEntry) {
    const { error } = await db().from("api_usage").insert(e);
    if (error) console.error("api_usage insert failed", error.message);
  },
};

export function claudeContext(functionName: string, settings: Settings): ClaudeContext {
  return {
    createMessage: anthropicCreateMessage(requireEnv("ANTHROPIC_API_KEY")),
    model: settings.claude_model,
    usage: usageStore,
    capUsd: settings.daily_ai_spend_cap_usd,
    functionName,
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS, ...headers },
  });
}

export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  if (req.method === "GET") return Object.fromEntries(new URL(req.url).searchParams) as T;
  const text = await req.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

export function handler(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  };
}

// ---------------------------------------------------------------------------
// Auth: cron secret (pg_cron / chained calls) or a staff user's JWT (admin app).
// ---------------------------------------------------------------------------
export type Role = "admin" | "sales" | "editor";
export interface Caller {
  kind: "cron" | "user";
  userId?: string;
  role?: Role;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i]! ^ eb[i]!;
  return diff === 0;
}

export async function authorize(req: Request, roles: Role[]): Promise<Caller> {
  const secret = env("CRON_SECRET");
  const given = req.headers.get("x-cron-secret");
  if (secret && given && timingSafeEqual(given, secret)) return { kind: "cron" };

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Missing credentials");
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid session");
  const { data: au } = await db().from("admin_users").select("role").eq("user_id", data.user.id).maybeSingle();
  const role = au?.role as Role | undefined;
  if (!role || (role !== "admin" && !roles.includes(role))) throw new HttpError(403, "Not allowed");
  return { kind: "user", userId: data.user.id, role };
}

// ---------------------------------------------------------------------------
// Jobs and chaining. Edge functions have a wall-clock limit, so long work runs in
// batches and re-invokes itself (or the next step) with the cron secret.
// ---------------------------------------------------------------------------
export class Job {
  readonly id: number;
  readonly name: string;
  items = 0;
  details: Record<string, unknown> = {};
  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }

  static async start(name: string, details: Record<string, unknown> = {}): Promise<Job> {
    const row = must(await db().from("job_runs").insert({ job_name: name, details }).select("id").single(), "start job") as { id: number };
    const job = new Job(row.id, name);
    job.details = details;
    return job;
  }

  async finish(status: "success" | "partial" | "failed" | "skipped", error?: string): Promise<void> {
    await db()
      .from("job_runs")
      .update({ status, finished_at: new Date().toISOString(), items_processed: this.items, error: error ?? null, details: this.details })
      .eq("id", this.id);
  }
}

export async function lastSuccessAt(jobName: string): Promise<Date | null> {
  const { data } = await db()
    .from("job_runs")
    .select("started_at")
    .eq("job_name", jobName)
    .in("status", ["success", "partial"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.started_at ? new Date(data.started_at as string) : null;
}

/** Fire-and-forget call to another function (or this one) with the cron secret. */
export function invokeFunction(name: string, body: Record<string, unknown>): Promise<void> {
  const p = fetch(`${requireEnv("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": requireEnv("CRON_SECRET") },
    body: JSON.stringify(body),
  })
    .then(async (r) => {
      if (!r.ok) console.error(`invoke ${name} -> ${r.status}: ${(await r.text()).slice(0, 300)}`);
    })
    .catch((e) => console.error(`invoke ${name} failed`, e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
  return p;
}

/** Runs work after the response is sent, when the runtime supports it. */
export function background(p: Promise<unknown>): void {
  const guarded = p.catch((e) => console.error("background task failed", e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(guarded);
}

export function deadline(ms: number): () => boolean {
  const end = Date.now() + ms;
  return () => Date.now() > end;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
