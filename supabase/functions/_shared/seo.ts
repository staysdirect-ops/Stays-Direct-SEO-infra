import {
  allowedNumbers,
  blogMarkdown,
  blogSchema,
  buildBlogPrompt,
  buildBlogSystem,
  buildLocationDataPack,
  buildLocationPagePrompt,
  buildLocationPageSystem,
  buildProjectDataPack,
  buildProjectPagePrompt,
  buildProjectPageSystem,
  buildReviewPrompt,
  callClaude,
  checkQuality,
  dataPackHash,
  factNumbers,
  formatGbp,
  haversineMiles,
  HUB_PATH,
  LOCATION_PROPERTY_RADIUS,
  LOCATION_PROJECT_RADIUS,
  PROJECT_TOWN_RADIUS as PROJECT_STOCK_RADIUS,
  locationSchema,
  pageMarkdown,
  pickInternalLinks,
  projectSchema,
  publicPath,
  REVIEW_SYSTEM,
  slugify,
  SpendCapExceededError,
  statusFromQuality,
  stripMarkdown,
  validateBlogDraft,
  validatePageDraft,
  validateReview,
  type ClaudeContext,
  type InternalLink,
  type LatLng,
  type LocationDataPack,
  type ProjectDataPack,
  type ProjectRow,
  type ProjectType,
  type PropertyRow,
  type Settings,
  type TownRow,
} from "./core/index.ts";
import { claudeContext, db, errorMessage, must } from "./runtime.ts";

export async function loadProperties(): Promise<PropertyRow[]> {
  const rows = must(
    await db()
      .from("properties")
      .select("id,name,town,bedrooms,max_guests,parking_spaces,van_parking,pppn_from,status,available_from,lat,lng")
      .not("lat", "is", null),
    "load properties"
  ) as Array<PropertyRow & { pppn_from: number | string }>;
  return rows.map((r) => ({ ...r, pppn_from: Number(r.pppn_from) }));
}

export async function loadTowns(): Promise<TownRow[]> {
  const rows = must(
    await db().from("towns").select("id,name,slug,county,region,population,avg_hotel_pppn,lat,lng").eq("is_active", true).not("lat", "is", null).limit(2000),
    "load towns"
  ) as Array<TownRow & { avg_hotel_pppn: number | string | null }>;
  return rows.map((r) => ({ ...r, avg_hotel_pppn: r.avg_hotel_pppn == null ? null : Number(r.avg_hotel_pppn) }));
}

export async function loadQualifiedProjects(): Promise<ProjectRow[]> {
  const rows = must(
    await db()
      .from("radar_projects")
      .select("id,title,project_type,value_gbp,est_workers_away_from_home,start_date,end_date,supplier_name,site_town,site_location_text,site_lat,site_lng")
      .in("status", ["qualified", "lead_created"])
      .not("site_lat", "is", null)
      .limit(2000),
    "load projects"
  ) as Array<Omit<ProjectRow, "lat" | "lng"> & { site_lat: number; site_lng: number; value_gbp: number | string | null }>;
  return rows.map(({ site_lat, site_lng, ...r }) => ({ ...r, value_gbp: r.value_gbp == null ? null : Number(r.value_gbp), lat: site_lat, lng: site_lng }));
}

interface LiveItem extends Partial<LatLng> {
  kind: "location" | "project" | "blog";
  slug: string;
  title: string;
  name: string | null;
  updated_at: string | null;
}

export async function loadLive(): Promise<LiveItem[]> {
  return must(await db().from("published_content").select("kind,slug,title,name,updated_at,lat,lng"), "load published") as LiveItem[];
}

function linksFor(from: LatLng | null, selfPath: string, live: LiveItem[]): InternalLink[] {
  const withPoint = (i: LiveItem): i is LiveItem & LatLng => i.lat != null && i.lng != null;
  return pickInternalLinks({
    from,
    selfPath,
    towns: live.filter((i) => i.kind === "location").filter(withPoint).map((i) => ({ slug: i.slug, name: i.name ?? i.title, lat: i.lat, lng: i.lng })),
    projects: live.filter((i) => i.kind === "project").filter(withPoint).map((i) => ({ slug: i.slug, name: i.name ?? i.title, lat: i.lat, lng: i.lng })),
    blog: live
      .filter((i) => i.kind === "blog")
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
      .map((i) => ({ slug: i.slug, title: i.title })),
  });
}

interface PageRow {
  id: string;
  page_type: "location" | "project";
  slug: string;
  status: string;
  town_id: string | null;
  project_id: string | null;
  project_name: string | null;
  project_location_text: string | null;
  project_town: string | null;
  project_lat: number | null;
  project_lng: number | null;
  published_snapshot: unknown;
  data_pack_hash: string | null;
}

const PAGE_COLUMNS =
  "id,page_type,slug,status,town_id,project_id,project_name,project_location_text,project_town,project_lat,project_lng,published_snapshot,data_pack_hash";

export async function loadPage(id: string): Promise<PageRow> {
  return must(await db().from("seo_pages").select(PAGE_COLUMNS).eq("id", id).single(), "load page") as PageRow;
}

export interface PackInputs {
  properties: PropertyRow[];
  towns: TownRow[];
  projects: ProjectRow[];
}

export async function loadPackInputs(): Promise<PackInputs> {
  const [properties, towns, projects] = await Promise.all([loadProperties(), loadTowns(), loadQualifiedProjects()]);
  return { properties, towns, projects };
}

export async function buildPack(page: PageRow, inputs: PackInputs, settings: Settings): Promise<{ pack: LocationDataPack | ProjectDataPack; point: LatLng; name: string }> {
  if (page.page_type === "location") {
    const town = inputs.towns.find((t) => t.id === page.town_id);
    if (!town) throw new Error("Town is missing, inactive or not geocoded");
    return {
      pack: buildLocationDataPack({ town, properties: inputs.properties, projects: inputs.projects, facts: settings.company_facts }),
      point: town,
      name: town.name,
    };
  }
  let point: LatLng | null = page.project_lat != null && page.project_lng != null ? { lat: page.project_lat, lng: page.project_lng } : null;
  let details = {
    project_type: null as ProjectType | null,
    value_gbp: null as number | null,
    workers_away_from_home: null as number | null,
    start_date: null as string | null,
    end_date: null as string | null,
    contractor: null as string | null,
  };
  if (page.project_id) {
    const p = inputs.projects.find((x) => x.id === page.project_id);
    if (p) {
      point ??= p;
      details = {
        project_type: p.project_type,
        value_gbp: p.value_gbp,
        workers_away_from_home: p.est_workers_away_from_home,
        start_date: p.start_date,
        end_date: p.end_date,
        contractor: p.supplier_name,
      };
    }
  }
  if (!point) throw new Error("Project page has no location");
  const name = page.project_name ?? page.slug;
  return {
    pack: buildProjectDataPack({
      project: { name, location: page.project_location_text, nearest_town: page.project_town, point, ...details },
      properties: inputs.properties,
      towns: inputs.towns,
      facts: settings.company_facts,
    }),
    point,
    name,
  };
}

function keyFacts(pack: LocationDataPack | ProjectDataPack): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  if (pack.kind === "location") {
    const p = pack.properties;
    if (p.count) out.push({ label: `Houses within ${p.radius_miles} miles`, value: String(p.count) });
    if (p.from_pppn != null) out.push({ label: "Per person per night, bills included", value: `From ${formatGbp(p.from_pppn)}` });
    if (p.nearest[0]) out.push({ label: `Nearest house to ${pack.town.name}`, value: `${p.nearest[0].distance_miles} miles` });
    if (pack.projects.items.length) out.push({ label: `Major projects within ${pack.projects.radius_miles} miles`, value: String(pack.projects.items.length) });
  } else {
    const houses = pack.towns.reduce((s, t) => s + t.our_houses, 0);
    if (houses) out.push({ label: "Our houses near the site", value: String(houses) });
    if (pack.towns[0]) out.push({ label: `Nearest, in ${pack.towns[0].name}`, value: `${pack.towns[0].distance_miles} miles` });
    const from = pack.towns.length ? Math.min(...pack.towns.map((t) => t.from_pppn ?? Infinity)) : null;
    if (from != null && Number.isFinite(from)) out.push({ label: "Per person per night, bills included", value: `From ${formatGbp(from)}` });
  }
  out.push({ label: "Quotes", value: "Same day" });
  return out;
}

async function similarity(text: string, excludeId: string | null, kind: "page" | "blog"): Promise<{ max: number | null; slug: string | null }> {
  const rows = must(await db().rpc("seo_similar_pages", { p_text: text, p_exclude_id: excludeId, p_limit: 20, p_kind: kind }), "similar pages") as Array<{ slug: string; similarity: number }>;
  const top = rows[0];
  return { max: top ? Number(top.similarity) : null, slug: top?.slug ?? null };
}

async function aiReview(ctx: ClaudeContext, md: string, pack: unknown): Promise<{ score: number; issues: string[] } | null> {
  try {
    const r = await callClaude(ctx, { system: REVIEW_SYSTEM, user: buildReviewPrompt(md, pack), json: true, maxTokens: 1500, effort: "low" });
    return validateReview(r.data);
  } catch (e) {
    if (e instanceof SpendCapExceededError) throw e;
    console.error("review failed", errorMessage(e));
    return null;
  }
}

/** Generates a location or project page into the review queue. Live copy (published_snapshot) is untouched. */
export async function generatePage(pageId: string, settings: Settings, inputs?: PackInputs): Promise<{ status: string; score: number }> {
  const page = await loadPage(pageId);
  const previousStatus = page.status;
  must(await db().from("seo_pages").update({ status: "generating", generation_error: null }).eq("id", pageId), "mark generating");
  try {
    const packInputs = inputs ?? (await loadPackInputs());
    const { pack, point, name } = await buildPack(page, packInputs, settings);
    const live = await loadLive();
    const kind = page.page_type;
    const links = [...linksFor(point, publicPath(kind, page.slug), live), { kind: "hub" as const, href: HUB_PATH, label: "All contractor accommodation locations" }];
    const ctx = claudeContext("seo-generate-page", settings);
    const expectedH1 = kind === "location" ? `Contractor Accommodation in ${name}` : `Accommodation near ${name}`;
    const r = await callClaude(ctx, {
      system: kind === "location" ? buildLocationPageSystem(settings.brand_voice, settings.company_facts) : buildProjectPageSystem(settings.brand_voice, settings.company_facts),
      user: kind === "location" ? buildLocationPagePrompt(pack as LocationDataPack, links) : buildProjectPagePrompt(pack as ProjectDataPack, links),
      json: true,
      maxTokens: 12_000,
      effort: "medium",
    });
    const draft = validatePageDraft(r.data, expectedH1);
    const md = pageMarkdown(draft);
    const searchText = stripMarkdown(md);
    const sim = await similarity(searchText, pageId, "page");
    const review = await aiReview({ ...ctx, functionName: "seo-review" }, md, pack);
    const q = checkQuality({
      kind,
      title: draft.title,
      metaDescription: draft.meta_description,
      bodyMarkdown: md,
      faqCount: draft.faqs.length,
      allowedNumbers: allowedNumbers(pack),
      maxSimilarity: sim.max,
      mostSimilarSlug: sim.slug,
      aiReview: review,
    });
    const notes = review ? q.notes : [...q.notes, "AI review unavailable; check manually."];
    const schema =
      kind === "location"
        ? locationSchema({
            townName: name,
            county: (pack as LocationDataPack).town.county,
            slug: page.slug,
            description: draft.meta_description,
            faqs: draft.faqs,
            fromPppn: (pack as LocationDataPack).properties.from_pppn,
            facts: settings.company_facts,
          })
        : projectSchema({ projectName: name, slug: page.slug, description: draft.meta_description, faqs: draft.faqs, nearestTown: page.project_town, facts: settings.company_facts });
    const status = statusFromQuality(q.score);
    must(
      await db()
        .from("seo_pages")
        .update({
          title: draft.title.slice(0, 70),
          meta_description: draft.meta_description,
          h1: draft.h1,
          intro: draft.intro,
          sections: draft.sections,
          faqs: draft.faqs,
          key_facts: keyFacts(pack),
          schema_jsonld: schema,
          internal_links: links,
          word_count: q.wordCount,
          quality_score: q.score,
          quality_notes: notes,
          data_pack: pack,
          data_pack_hash: dataPackHash(pack),
          search_text: searchText,
          status,
          generated_at: new Date().toISOString(),
          generation_error: null,
        })
        .eq("id", pageId),
      "save page"
    );
    return { status, score: q.score };
  } catch (e) {
    await db()
      .from("seo_pages")
      .update({ status: previousStatus === "generating" ? "queued" : previousStatus, generation_error: errorMessage(e).slice(0, 1000) })
      .eq("id", pageId);
    throw e;
  }
}

/** Towns worth a page: our stock within 15 miles or qualified projects within 20 miles, ranked by both. */
export function rankTowns(inputs: PackInputs, exclude: Set<string>): Array<{ town: TownRow; priority: number }> {
  return inputs.towns
    .filter((t) => !exclude.has(t.id))
    .map((town) => ({ town, priority: pagePriority(town, inputs, LOCATION_PROPERTY_RADIUS) }))
    .filter((x) => x.priority > 0)
    .sort((a, b) => b.priority - a.priority);
}

/** Queue order: local stock matters most, then nearby qualified projects. */
export function pagePriority(point: LatLng, inputs: PackInputs, stockRadius: number): number {
  const props = inputs.properties.filter((p) => p.status !== "offline" && haversineMiles(point, p) <= stockRadius).length;
  const projects = inputs.projects.filter((p) => haversineMiles(point, p) <= LOCATION_PROJECT_RADIUS).length;
  return Math.min(props, 5) * 10 + Math.min(projects, 4) * 5;
}

/** Adds up to `target` new pages (best towns, big Radar projects) and re-ranks everything waiting. */
export async function ensurePageQueue(target: number, inputs: PackInputs): Promise<number> {
  const existing = must(
    await db().from("seo_pages").select("id,page_type,town_id,project_id,status,project_lat,project_lng"),
    "load pages"
  ) as Array<{ id: string; page_type: string; town_id: string | null; project_id: string | null; status: string; project_lat: number | null; project_lng: number | null }>;
  let created = 0;

  // Radar projects big enough for their own page: >= £20m or >= 30 workers away from home.
  // Skip sites already covered by a project page within 5 miles, to avoid near-duplicate pages.
  const haveProjects = new Set(existing.map((p) => p.project_id).filter(Boolean));
  const projectPoints: LatLng[] = existing
    .filter((p) => p.page_type === "project" && p.project_lat != null && p.project_lng != null)
    .map((p) => ({ lat: p.project_lat!, lng: p.project_lng! }));
  const big = inputs.projects.filter(
    (p) =>
      !haveProjects.has(p.id) &&
      ((p.value_gbp ?? 0) >= 20_000_000 || (p.est_workers_away_from_home ?? 0) >= 30) &&
      !projectPoints.some((pt) => haversineMiles(pt, p) <= 5)
  );
  for (const p of big.slice(0, target)) {
    const { error } = await db().from("seo_pages").insert({
      page_type: "project",
      slug: `projects/${slugify(p.title)}`,
      project_id: p.id,
      project_name: p.title,
      project_location_text: p.site_location_text,
      project_town: p.site_town,
      project_location: `SRID=4326;POINT(${p.lng} ${p.lat})`,
      priority: pagePriority(p, inputs, PROJECT_STOCK_RADIUS),
      status: "queued",
    });
    if (!error) {
      created++;
      projectPoints.push(p);
    }
  }

  const haveTowns = new Set(existing.map((p) => p.town_id).filter((x): x is string => !!x));
  for (const { town, priority } of rankTowns(inputs, haveTowns).slice(0, target)) {
    const { error } = await db().from("seo_pages").insert({ page_type: "location", slug: town.slug, town_id: town.id, priority, status: "queued" });
    if (!error) created++;
  }

  const townsById = new Map(inputs.towns.map((t) => [t.id, t]));
  for (const page of existing.filter((p) => p.status === "queued" || p.status === "needs_refresh")) {
    const point = page.page_type === "location"
      ? townsById.get(page.town_id ?? "")
      : page.project_lat != null && page.project_lng != null
        ? { lat: page.project_lat, lng: page.project_lng }
        : undefined;
    if (!point) continue;
    const priority = pagePriority(point, inputs, page.page_type === "location" ? LOCATION_PROPERTY_RADIUS : PROJECT_STOCK_RADIUS);
    await db().from("seo_pages").update({ priority }).eq("id", page.id);
  }
  return created;
}

export async function nextPagesToGenerate(limit: number): Promise<string[]> {
  const rows = must(
    await db()
      .from("seo_pages")
      .select("id,status,priority,created_at")
      .in("status", ["needs_refresh", "queued"])
      .order("priority", { ascending: false })
      .order("created_at")
      .limit(limit * 3),
    "next pages"
  ) as Array<{ id: string; status: string }>;
  return [...rows.filter((r) => r.status === "needs_refresh"), ...rows.filter((r) => r.status === "queued")].slice(0, limit).map((r) => r.id);
}

/** Live pages whose data pack changed since generation are flagged needs_refresh. */
export async function flagStalePages(settings: Settings, inputs: PackInputs): Promise<string[]> {
  const rows = must(await db().from("seo_pages").select(PAGE_COLUMNS).not("published_snapshot", "is", null), "live pages") as PageRow[];
  const stale: string[] = [];
  for (const page of rows) {
    try {
      const { pack } = await buildPack(page, inputs, settings);
      if (dataPackHash(pack) !== page.data_pack_hash) stale.push(page.id);
    } catch (e) {
      console.error("refresh check failed", page.slug, errorMessage(e));
    }
  }
  if (stale.length) must(await db().from("seo_pages").update({ status: "needs_refresh" }).in("id", stale), "flag stale");
  return stale;
}

// ---------------------------------------------------------------------------
// Blog
// ---------------------------------------------------------------------------
async function uniqueBlogSlug(title: string): Promise<string> {
  const base = slugify(title) || "post";
  const rows = must(await db().from("blog_posts").select("slug").like("slug", `${base}%`), "slugs") as Array<{ slug: string }>;
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export async function generateBlog(topicId: string, settings: Settings): Promise<{ status: string; score: number; post_id: string }> {
  const topic = must(await db().from("blog_topics").select("id,keyword,working_title,intent,status").eq("id", topicId).single(), "load topic") as {
    id: string;
    keyword: string;
    working_title: string;
    intent: string | null;
    status: string;
  };
  must(await db().from("blog_topics").update({ status: "generating" }).eq("id", topicId), "mark topic");
  try {
    const live = await loadLive();
    const links: InternalLink[] = [
      ...live
        .filter((i) => i.kind === "location")
        .slice(0, 3)
        .map((i) => ({ kind: "town" as const, href: publicPath("location", i.slug), label: `Contractor accommodation in ${i.name ?? i.title}` })),
      { kind: "hub", href: HUB_PATH, label: "Contractor accommodation locations" },
      { kind: "quote", href: "/quote", label: "Get a same-day quote" },
    ];
    const ctx = claudeContext("seo-generate-blog", settings);
    const r = await callClaude(ctx, {
      system: buildBlogSystem(settings.brand_voice, settings.company_facts),
      user: buildBlogPrompt(topic, links),
      json: true,
      maxTokens: 16_000,
      effort: "medium",
    });
    const draft = validateBlogDraft(r.data, topic.working_title);
    const md = blogMarkdown(draft);
    const searchText = stripMarkdown(md);
    const topicNumbers = `${topic.keyword} ${topic.working_title}`.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const allowed = new Set([...factNumbers(settings.company_facts), ...topicNumbers]);
    const sim = await similarity(searchText, null, "blog");
    const q = checkQuality({
      kind: "blog",
      title: draft.title,
      metaDescription: draft.meta_description,
      bodyMarkdown: md,
      faqCount: draft.faqs.length,
      allowedNumbers: allowed,
      maxSimilarity: sim.max,
      mostSimilarSlug: sim.slug,
    });
    const slug = await uniqueBlogSlug(draft.title);
    const status = statusFromQuality(q.score);
    const post = must(
      await db()
        .from("blog_posts")
        .insert({
          topic_id: topic.id,
          slug,
          title: draft.title,
          meta_description: draft.meta_description,
          excerpt: draft.excerpt,
          body_markdown: draft.body_markdown,
          faqs: draft.faqs,
          schema_jsonld: blogSchema({ title: draft.title, slug, description: draft.meta_description, faqs: draft.faqs, publishedAt: null, updatedAt: null, facts: settings.company_facts }),
          internal_links: links,
          word_count: q.wordCount,
          quality_score: q.score,
          quality_notes: q.notes,
          search_text: searchText,
          status,
        })
        .select("id")
        .single(),
      "insert post"
    ) as { id: string };
    must(await db().from("blog_topics").update({ status: "written" }).eq("id", topicId), "topic written");
    return { status, score: q.score, post_id: post.id };
  } catch (e) {
    await db().from("blog_topics").update({ status: topic.status === "generating" ? "queued" : topic.status, notes: `Generation failed: ${errorMessage(e).slice(0, 500)}` }).eq("id", topicId);
    throw e;
  }
}
