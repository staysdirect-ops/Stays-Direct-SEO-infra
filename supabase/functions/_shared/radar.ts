import {
  buildEnrichPrompt,
  buildOutreachPrompt,
  buildOutreachSystem,
  callClaude,
  ClaudeRefusalError,
  contractsFinderSearchUrl,
  createRateLimiter,
  dedupeProjects,
  ENRICH_SYSTEM,
  fetchWithRetry,
  findATenderSearchUrl,
  findCompany,
  geocode,
  ingestWindow,
  JsonParseError,
  mapRelease,
  ocdsDate,
  passesFilter,
  scoreOpportunity,
  SpendCapExceededError,
  statusFromEnrichment,
  templateOutreach,
  toWktPoint,
  validateEnrichment,
  validateOutreach,
  type EnrichmentInput,
  type IngestedProject,
  type LocationConfidence,
  type MatchedPropertySummary,
  type OcdsReleasePackage,
  type OutreachDraft,
  type RadarSource,
  type Settings,
} from "./core/index.ts";
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
} from "./runtime.ts";

export const STEP_BUDGET_MS = 110_000;

export const RADAR_STEPS = [
  "radar-ingest-contracts-finder",
  "radar-ingest-find-a-tender",
  "radar-enrich",
  "radar-match",
  "radar-create-lead",
] as const;
export type RadarStep = (typeof RADAR_STEPS)[number];

export function nextStep(step: RadarStep): RadarStep | null {
  const i = RADAR_STEPS.indexOf(step);
  return RADAR_STEPS[i + 1] ?? null;
}

export interface StepBody {
  chain?: boolean;
  run_id?: number;
  backfill_days?: number;
  ids?: string[];
  continuation?: { from: string; to: string; next_url: string | null };
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------
const govThrottle = createRateLimiter(1000);

async function lastWindowEnd(jobName: string): Promise<Date | null> {
  const { data } = await db()
    .from("job_runs")
    .select("details")
    .eq("job_name", jobName)
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const to = (data?.details as { window_to?: string } | undefined)?.window_to;
  return to ? new Date(to) : null;
}

async function storeProjects(projects: IngestedProject[]): Promise<{ inserted: number; skipped: number }> {
  if (!projects.length) return { inserted: 0, skipped: 0 };
  const ocids = [...new Set(projects.map((p) => p.ocid))];
  const keys = [...new Set(projects.map((p) => p.dedupe_key))];
  const [byOcid, byKey] = await Promise.all([
    db().from("radar_projects").select("source_id, ocid, dedupe_key").in("ocid", ocids),
    db().from("radar_projects").select("source_id, ocid, dedupe_key").in("dedupe_key", keys),
  ]);
  const existingRows = [...(must(byOcid, "existing by ocid") ?? []), ...(must(byKey, "existing by key") ?? [])] as Array<{
    source_id: string;
    ocid: string | null;
    dedupe_key: string | null;
  }>;
  const unique = dedupeProjects(projects, {
    ocids: new Set(existingRows.filter((r) => r.ocid).map((r) => r.ocid!)),
    dedupeKeys: new Set(existingRows.filter((r) => r.dedupe_key).map((r) => r.dedupe_key!)),
    sourceIds: new Set(existingRows.map((r) => r.source_id)),
  });
  if (unique.length) {
    must(await db().from("radar_projects").upsert(unique, { onConflict: "source_id" }), "upsert radar_projects");
  }
  return { inserted: unique.length, skipped: projects.length - unique.length };
}

export async function ingest(source: RadarSource, jobName: RadarStep, body: StepBody, settings: Settings): Promise<{ job: Job; done: boolean; continuation?: StepBody["continuation"] }> {
  const now = new Date();
  let from: string;
  let to: string;
  let url: string | null;
  if (body.continuation) {
    ({ from, to } = body.continuation);
    url = body.continuation.next_url;
  } else {
    const w = ingestWindow(now, await lastWindowEnd(jobName), body.backfill_days);
    from = ocdsDate(w.from);
    to = ocdsDate(w.to);
    url = source === "contracts_finder" ? contractsFinderSearchUrl(from, to) : findATenderSearchUrl(from, to);
  }
  const job = await Job.start(jobName, { run_id: body.run_id, window_from: from, window_to: to, continued: !!body.continuation });
  const outOfTime = deadline(STEP_BUDGET_MS);
  const filter = { minValueGbp: settings.radar_min_value_gbp, cpvPrefixes: settings.radar_cpv_prefixes };
  let pages = 0;
  let seen = 0;
  let kept = 0;
  let stored = 0;
  let duplicates = 0;
  try {
    while (url && !outOfTime()) {
      const res = await fetchWithRetry(url, { headers: { accept: "application/json" } }, { retries: 5, beforeAttempt: govThrottle });
      if (!res.ok) throw new Error(`${source} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const pkg = (await res.json()) as OcdsReleasePackage;
      pages++;
      const releases = pkg.releases ?? [];
      seen += releases.length;
      const relevant = releases
        .map((r) => mapRelease(source, r))
        .filter((p): p is IngestedProject => !!p && passesFilter(p, filter));
      kept += relevant.length;
      const r = await storeProjects(relevant);
      stored += r.inserted;
      duplicates += r.skipped;
      const next = pkg.links?.next ?? null;
      url = next && next !== url && releases.length > 0 ? next : null;
    }
    job.items = stored;
    job.details = { ...job.details, pages, releases_seen: seen, releases_kept: kept, stored, duplicates };
    if (url) {
      await job.finish("partial");
      return { job, done: false, continuation: { from, to, next_url: url } };
    }
    await job.finish("success");
    return { job, done: true };
  } catch (e) {
    job.items = stored;
    job.details = { ...job.details, pages, releases_seen: seen, stored };
    await job.finish("failed", errorMessage(e));
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Enrich
// ---------------------------------------------------------------------------
interface ProjectRow extends EnrichmentInput {
  id: string;
  supplier_companies_house_number: string | null;
}

const ENRICH_COLUMNS =
  "id,title,description,buyer_name,buyer_postcode,supplier_name,supplier_companies_house_number,value_gbp,cpv_codes,delivery_text,delivery_postcodes,start_date,end_date,duration_months";

export async function enrichProject(p: ProjectRow, settings: Settings): Promise<string> {
  const ctx = claudeContext("radar-enrich", settings);
  const r = await callClaude(ctx, { system: ENRICH_SYSTEM, user: buildEnrichPrompt(p), json: true, maxTokens: 2000, effort: "low" });
  const e = validateEnrichment(r.data, p);
  let confidence: LocationConfidence = e.location_confidence;
  let point = null as null | { lat: number; lng: number; method: string };
  if (e.is_relevant && (e.site_postcode || e.site_town)) {
    const g = await geocode({ postcode: e.site_postcode, town: e.site_town }).catch(() => null);
    if (g) {
      point = g;
      if (g.method !== "postcode" && confidence === "high") confidence = "medium";
    }
  }
  if (e.is_relevant && !point) confidence = "low";

  const update: Record<string, unknown> = {
    is_relevant: e.is_relevant,
    relevance_reason: e.relevance_reason,
    project_type: e.project_type,
    site_location_text: e.site_location_text,
    site_postcode: e.site_postcode,
    site_town: e.site_town,
    location_confidence: confidence,
    est_workers_min: e.est_workers_min,
    est_workers_max: e.est_workers_max,
    est_workers_away_from_home: e.est_workers_away_from_home,
    duration_months: e.duration_months,
    start_date: e.start_date,
    site_location: point ? toWktPoint(point) : null,
    geocode_method: point?.method ?? null,
    status: statusFromEnrichment({ is_relevant: e.is_relevant, location_confidence: confidence }),
    enriched_at: new Date().toISOString(),
    enrich_error: null,
    matched_at: null,
  };
  const chKey = env("COMPANIES_HOUSE_API_KEY");
  if (e.is_relevant && chKey && p.supplier_name && !p.supplier_companies_house_number) {
    const company = await findCompany(chKey, p.supplier_name).catch(() => null);
    if (company) {
      update.supplier_companies_house_number = company.company_number;
      update.supplier_address = company.address;
    }
  }
  must(await db().from("radar_projects").update(update).eq("id", p.id), "update enrichment");
  return update.status as string;
}

export async function enrichBatch(body: StepBody, settings: Settings): Promise<{ job: Job; more: boolean; stopped: string | null }> {
  const job = await Job.start("radar-enrich", { run_id: body.run_id });
  const outOfTime = deadline(STEP_BUDGET_MS);
  let q = db().from("radar_projects").select(ENRICH_COLUMNS).order("created_at").limit(40);
  q = body.ids?.length ? q.in("id", body.ids) : q.eq("status", "new");
  const rows = must(await q, "load projects to enrich") as unknown as ProjectRow[];
  const counts: Record<string, number> = {};
  let stopped: string | null = null;
  let processed = 0;
  for (const p of rows) {
    if (outOfTime()) break;
    try {
      const status = await enrichProject(p, settings);
      counts[status] = (counts[status] ?? 0) + 1;
      processed++;
    } catch (e) {
      if (e instanceof SpendCapExceededError) {
        stopped = "spend_cap";
        break;
      }
      await db().from("radar_projects").update({ enrich_error: errorMessage(e).slice(0, 500), status: "needs_review" }).eq("id", p.id);
      counts.errors = (counts.errors ?? 0) + 1;
      processed++;
    }
  }
  job.items = processed;
  job.details = { ...job.details, ...counts, stopped };
  const { count } = await db().from("radar_projects").select("id", { count: "exact", head: true }).eq("status", "new");
  const more = !body.ids?.length && !stopped && (count ?? 0) > 0;
  await job.finish(stopped ? "partial" : "success", stopped === "spend_cap" ? "Daily AI spend cap reached" : undefined);
  return { job, more, stopped };
}

// ---------------------------------------------------------------------------
// Match + score
// ---------------------------------------------------------------------------
export async function matchProject(
  p: { id: string; value_gbp: number | null; est_workers_away_from_home: number | null; start_date: string | null; location_confidence: LocationConfidence | null },
  settings: Settings
): Promise<number> {
  const matches = must(
    await db().rpc("match_properties", { p_project_id: p.id, p_radius_miles: settings.radar_match_radius_miles }),
    "match_properties"
  ) as Array<{ property_id: string; distance_miles: number }>;
  must(await db().from("radar_matches").delete().eq("project_id", p.id), "clear matches");
  if (matches.length) {
    must(
      await db().from("radar_matches").insert(matches.map((m) => ({ project_id: p.id, property_id: m.property_id, distance_miles: m.distance_miles }))),
      "insert matches"
    );
  }
  const nearest = matches.length ? Math.min(...matches.map((m) => Number(m.distance_miles))) : null;
  const s = scoreOpportunity({
    valueGbp: p.value_gbp,
    workersAwayFromHome: p.est_workers_away_from_home,
    nearestPropertyMiles: nearest,
    matchRadiusMiles: settings.radar_match_radius_miles,
    startDate: p.start_date,
    locationConfidence: p.location_confidence,
  });
  must(
    await db()
      .from("radar_projects")
      .update({ score: s.score, score_breakdown: { ...s.breakdown, flags: s.flags, nearest_miles: nearest, matches: matches.length }, matched_at: new Date().toISOString() })
      .eq("id", p.id),
    "save score"
  );
  return matches.length;
}

export async function matchBatch(body: StepBody, settings: Settings): Promise<{ job: Job }> {
  const job = await Job.start("radar-match", { run_id: body.run_id });
  let q = db()
    .from("radar_projects")
    .select("id,value_gbp,est_workers_away_from_home,start_date,location_confidence")
    .not("site_location", "is", null)
    .limit(500);
  q = body.ids?.length ? q.in("id", body.ids) : q.eq("status", "qualified").is("matched_at", null);
  const rows = must(await q, "load projects to match") as Array<Parameters<typeof matchProject>[0]>;
  let withStock = 0;
  for (const p of rows) {
    if ((await matchProject(p, settings)) > 0) withStock++;
  }
  job.items = rows.length;
  job.details = { ...job.details, projects: rows.length, with_nearby_stock: withStock };
  await job.finish("success");
  return { job };
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
interface LeadProject {
  id: string;
  title: string;
  supplier_name: string | null;
  supplier_companies_house_number: string | null;
  supplier_website: string | null;
  site_town: string | null;
  site_postcode: string | null;
  start_date: string | null;
  value_gbp: number | null;
  est_workers_away_from_home: number | null;
  score: number | null;
  score_breakdown: { flags?: string[]; nearest_miles?: number | null } | null;
}

export async function createLeadForProject(p: LeadProject, settings: Settings): Promise<"created" | "suppressed" | "exists"> {
  const suppressed = must(
    await db().rpc("is_company_suppressed", { p_companies_house_number: p.supplier_companies_house_number, p_company_name: p.supplier_name }),
    "suppression check"
  ) as boolean;
  if (suppressed) {
    await db()
      .from("radar_projects")
      .update({ status: "rejected", relevance_reason: "Suppressed: this company asked not to be contacted." })
      .eq("id", p.id);
    return "suppressed";
  }
  const matchRows = must(
    await db()
      .from("radar_matches")
      .select("property_id,distance_miles,properties(town,bedrooms,max_guests,pppn_from,van_parking,available_from)")
      .eq("project_id", p.id)
      .order("distance_miles")
      .limit(10),
    "load matches"
  ) as unknown as Array<{
    property_id: string;
    distance_miles: number;
    properties: { town: string; bedrooms: number; max_guests: number; pppn_from: number; van_parking: boolean; available_from: string | null } | null;
  }>;
  const matches: MatchedPropertySummary[] = matchRows
    .filter((m) => m.properties)
    .map((m) => ({ ...m.properties!, pppn_from: Number(m.properties!.pppn_from), distance_miles: Number(m.distance_miles) }));
  const input = {
    project_title: p.title,
    site_town: p.site_town,
    supplier_name: p.supplier_name,
    start_date: p.start_date,
    est_workers_away_from_home: p.est_workers_away_from_home,
    radius_miles: settings.radar_match_radius_miles,
    matches,
    facts: settings.company_facts,
    brand_voice: settings.brand_voice,
  };
  let draft: OutreachDraft;
  try {
    const r = await callClaude(claudeContext("radar-create-lead", settings), {
      system: buildOutreachSystem(settings.brand_voice, settings.company_facts),
      user: buildOutreachPrompt(input),
      json: true,
      maxTokens: 3000,
      effort: "medium",
    });
    draft = validateOutreach(r.data, input);
  } catch (e) {
    if (!(e instanceof SpendCapExceededError || e instanceof ClaudeRefusalError || e instanceof JsonParseError)) throw e;
    draft = templateOutreach(input);
  }
  const { error } = await db().from("leads").insert({
    source: "radar",
    company_name: p.supplier_name,
    companies_house_number: p.supplier_companies_house_number,
    company_website: p.supplier_website,
    project_id: p.id,
    project_title: p.title,
    site_town: p.site_town,
    site_postcode: p.site_postcode,
    est_workers: p.est_workers_away_from_home,
    start_date: p.start_date,
    value_gbp: p.value_gbp,
    matched_property_ids: matchRows.map((m) => m.property_id),
    nearest_property_miles: matches[0]?.distance_miles ?? null,
    outreach_subject: draft.outreach_subject,
    outreach_body: draft.outreach_body,
    linkedin_message: draft.linkedin_message,
    call_script: draft.call_script,
    score: p.score ?? 0,
    flags: [...new Set([...(p.score_breakdown?.flags ?? []), ...draft.flags])],
    status: "new",
  });
  if (error && error.code !== "23505") throw new Error(`insert lead: ${error.message}`);
  await db().from("radar_projects").update({ status: "lead_created" }).eq("id", p.id);
  return error ? "exists" : "created";
}

export async function createLeadsBatch(body: StepBody, settings: Settings): Promise<{ job: Job; more: boolean }> {
  const job = await Job.start("radar-create-lead", { run_id: body.run_id });
  const outOfTime = deadline(STEP_BUDGET_MS);
  let q = db()
    .from("radar_projects")
    .select("id,title,supplier_name,supplier_companies_house_number,supplier_website,site_town,site_postcode,start_date,value_gbp,est_workers_away_from_home,score,score_breakdown")
    .order("score", { ascending: false })
    .limit(30);
  q = body.ids?.length ? q.in("id", body.ids) : q.eq("status", "qualified").not("matched_at", "is", null);
  const rows = must(await q, "load projects for leads") as unknown as LeadProject[];
  const counts: Record<string, number> = { created: 0, suppressed: 0, exists: 0, errors: 0 };
  let processed = 0;
  for (const p of rows) {
    if (outOfTime()) break;
    try {
      counts[await createLeadForProject(p, settings)]!++;
    } catch (e) {
      counts.errors!++;
      console.error("lead failed", p.id, errorMessage(e));
    }
    processed++;
  }
  job.items = counts.created!;
  job.details = { ...job.details, ...counts };
  await job.finish(counts.errors ? "partial" : "success");
  return { job, more: !body.ids?.length && processed < rows.length };
}

/** Rolls the per-step job rows of one radar-run into its parent row. */
export async function finishRadarRun(runId: number): Promise<void> {
  const rows = must(
    await db().from("job_runs").select("job_name,status,items_processed,details").eq("details->>run_id", String(runId)),
    "load run steps"
  ) as Array<{ job_name: string; status: string; items_processed: number; details: Record<string, unknown> }>;
  const summary: Record<string, { items: number; runs: number; failed: number }> = {};
  for (const r of rows) {
    if (r.job_name === "radar-run") continue;
    const s = (summary[r.job_name] ??= { items: 0, runs: 0, failed: 0 });
    s.items += r.items_processed;
    s.runs++;
    if (r.status === "failed") s.failed++;
  }
  const failed = rows.some((r) => r.job_name !== "radar-run" && r.status === "failed");
  await db()
    .from("job_runs")
    .update({
      status: failed ? "partial" : "success",
      finished_at: new Date().toISOString(),
      items_processed: summary["radar-create-lead"]?.items ?? 0,
      details: { run_id: runId, steps: summary },
    })
    .eq("id", runId);
}

// ---------------------------------------------------------------------------
// HTTP entry point shared by the five step functions.
// ---------------------------------------------------------------------------
export async function runStep(step: RadarStep, body: StepBody, settings: Settings): Promise<Record<string, unknown>> {
  const chainNext = async () => {
    const next = nextStep(step);
    if (!body.chain) return;
    if (next) await invokeFunction(next, { chain: true, run_id: body.run_id, backfill_days: body.backfill_days });
    else if (body.run_id) await finishRadarRun(body.run_id);
  };
  switch (step) {
    case "radar-ingest-contracts-finder":
    case "radar-ingest-find-a-tender": {
      const source: RadarSource = step === "radar-ingest-contracts-finder" ? "contracts_finder" : "find_a_tender";
      const r = await ingest(source, step, body, settings).catch(async (e) => {
        await chainNext();
        throw e;
      });
      if (!r.done) await invokeFunction(step, { ...body, continuation: r.continuation });
      else await chainNext();
      return { job_id: r.job.id, done: r.done, ...r.job.details };
    }
    case "radar-enrich": {
      const r = await enrichBatch(body, settings);
      if (r.more) await invokeFunction(step, { chain: body.chain, run_id: body.run_id, backfill_days: body.backfill_days });
      else await chainNext();
      return { job_id: r.job.id, more: r.more, ...r.job.details };
    }
    case "radar-match": {
      const r = await matchBatch(body, settings);
      await chainNext();
      return { job_id: r.job.id, ...r.job.details };
    }
    case "radar-create-lead": {
      const r = await createLeadsBatch(body, settings);
      if (r.more) await invokeFunction(step, { chain: body.chain, run_id: body.run_id });
      else await chainNext();
      return { job_id: r.job.id, more: r.more, ...r.job.details };
    }
  }
}

export function radarStepServer(step: RadarStep): (req: Request) => Promise<Response> {
  return handler(async (req) => {
    await authorize(req, ["sales"]);
    const body = await readBody<StepBody>(req);
    const settings = await loadSettings();
    if (body.chain) {
      background(runStep(step, body, settings));
      return json({ accepted: true, step }, 202);
    }
    return json(await runStep(step, body, settings));
  });
}
