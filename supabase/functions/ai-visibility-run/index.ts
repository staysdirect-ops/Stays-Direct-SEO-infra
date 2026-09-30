import {
  askOpenAi,
  askPerplexity,
  assertUnderSpendCap,
  callClaude,
  detectMentions,
  parseSentiment,
  SENTIMENT_SYSTEM,
  SpendCapExceededError,
  VISIBILITY_SYSTEM,
  type Engine,
  type EngineAnswer,
  type Settings,
} from "../_shared/core/index.ts";
import {
  authorize,
  background,
  claudeContext,
  db,
  deadline,
  env,
  errorMessage,
  handler,
  invokeFunction,
  Job,
  json,
  loadSettings,
  must,
  readBody,
  usageStore,
} from "../_shared/runtime.ts";

interface Body {
  run_id?: number;
  offset?: number;
  prompt_ids?: string[];
}

function enginesAvailable(): Engine[] {
  const out: Engine[] = [];
  if (env("OPENAI_API_KEY")) out.push("chatgpt");
  if (env("ANTHROPIC_API_KEY")) out.push("claude");
  if (env("PERPLEXITY_API_KEY")) out.push("perplexity");
  return out;
}

async function ask(engine: Engine, prompt: string, settings: Settings): Promise<EngineAnswer> {
  if (engine === "claude") {
    const ctx = claudeContext("ai-visibility-run", settings);
    const r = await callClaude(ctx, {
      system: VISIBILITY_SYSTEM,
      user: prompt,
      maxTokens: 4000,
      effort: "low",
      webSearch: { maxUses: 3 },
    });
    return {
      text: r.text,
      citedUrls: r.citations.map((c) => c.url),
      model: r.model,
      usage: {
        provider: "anthropic",
        model: r.model,
        input_tokens: 0,
        output_tokens: 0,
        est_cost_usd: 0,
      },
    };
  }
  await assertUnderSpendCap(usageStore, settings.daily_ai_spend_cap_usd);
  const answer =
    engine === "chatgpt"
      ? await askOpenAi(env("OPENAI_API_KEY")!, settings.openai_model, prompt)
      : await askPerplexity(env("PERPLEXITY_API_KEY")!, settings.perplexity_model, prompt);
  await usageStore.record({ ...answer.usage, function_name: "ai-visibility-run" });
  return answer;
}

async function sentiment(
  text: string,
  settings: Settings
): Promise<"positive" | "neutral" | "negative" | null> {
  try {
    const r = await callClaude(claudeContext("ai-visibility-sentiment", settings), {
      system: SENTIMENT_SYSTEM,
      user: `Brand: ${settings.tracked_brand_names[0] ?? "StaysDirect"}\n\nAnswer:\n${text.slice(0, 6000)}`,
      json: true,
      maxTokens: 200,
      model: settings.claude_cheap_model,
    });
    return parseSentiment(r.data);
  } catch {
    return null;
  }
}

async function run(body: Body, settings: Settings): Promise<Record<string, unknown>> {
  const engines = enginesAvailable();
  let q = db()
    .from("ai_prompts")
    .select("id,prompt_text")
    .eq("is_active", true)
    .order("created_at")
    .order("id");
  if (body.prompt_ids?.length) q = q.in("id", body.prompt_ids);
  const prompts = must(await q, "load prompts") as Array<{ id: string; prompt_text: string }>;
  const work = prompts.flatMap((p) => engines.map((engine) => ({ prompt: p, engine })));

  const parent =
    body.run_id ?? (await Job.start("ai-visibility-run", { prompts: prompts.length, engines })).id;
  const step = await Job.start("ai-visibility-batch", { run_id: parent, offset: body.offset ?? 0 });
  const outOfTime = deadline(100_000);
  let i = body.offset ?? 0;
  let stopped: string | null = null;
  let done = 0;
  for (; i < work.length; i++) {
    if (outOfTime()) break;
    const { prompt, engine } = work[i]!;
    const row: Record<string, unknown> = {
      run_id: parent,
      prompt_id: prompt.id,
      engine,
      model: engine,
    };
    try {
      const a = await ask(engine, prompt.prompt_text, settings);
      const m = detectMentions(
        a.text,
        a.citedUrls,
        settings.tracked_brand_names,
        settings.competitor_names
      );
      Object.assign(row, {
        model: a.model,
        response_text: a.text,
        cited_urls: a.citedUrls,
        ...m,
        sentiment: m.brand_mentioned ? await sentiment(a.text, settings) : null,
      });
    } catch (e) {
      if (e instanceof SpendCapExceededError) {
        stopped = "spend_cap";
        break;
      }
      row.error = errorMessage(e).slice(0, 500);
    }
    must(await db().from("ai_visibility_checks").insert(row), "insert check");
    done++;
  }
  step.items = done;
  step.details = { ...step.details, next_offset: i, total: work.length, stopped };
  await step.finish(
    stopped ? "partial" : "success",
    stopped ? "Daily AI spend cap reached" : undefined
  );

  if (!stopped && i < work.length) {
    await invokeFunction("ai-visibility-run", {
      run_id: parent,
      offset: i,
      prompt_ids: body.prompt_ids,
    });
  } else {
    const { count } = await db()
      .from("ai_visibility_checks")
      .select("id", { count: "exact", head: true })
      .eq("run_id", parent);
    await db()
      .from("job_runs")
      .update({
        status: stopped ? "partial" : "success",
        finished_at: new Date().toISOString(),
        items_processed: count ?? 0,
        error: stopped ? "Daily AI spend cap reached" : null,
      })
      .eq("id", parent);
  }
  return { run_id: parent, processed: done, next_offset: i, total: work.length, stopped };
}

Deno.serve(
  handler(async (req) => {
    await authorize(req, ["editor", "sales"]);
    const body = await readBody<Body>(req);
    const settings = await loadSettings();
    if (!enginesAvailable().length) return json({ error: "No AI engine keys configured" }, 400);
    background(run(body, settings));
    return json({ accepted: true }, 202);
  })
);
