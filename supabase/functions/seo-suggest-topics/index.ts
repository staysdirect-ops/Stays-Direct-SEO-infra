import { buildTopicsPrompt, callClaude, fetchWithRetry, slugify, titleOverlap, TOPICS_SYSTEM, validateTopics } from "../_shared/core/index.ts";
import { authorize, claudeContext, db, errorMessage, handler, Job, json, loadSettings, must } from "../_shared/runtime.ts";

const SITEMAP = "https://staysdirect.co.uk/sitemap-blog.xml";

/** Existing live blog posts, as rough titles from their URL slugs, so topics never duplicate them. */
async function existingSiteTitles(): Promise<string[]> {
  try {
    const res = await fetchWithRetry(SITEMAP, {}, { retries: 2 });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
      .map((m) => m[1]!.replace(/\/+$/, "").split("/").pop() ?? "")
      .filter(Boolean)
      .map((slug) => slug.replace(/-/g, " "));
  } catch {
    return [];
  }
}

Deno.serve(
  handler(async (req) => {
    await authorize(req, ["editor"]);
    const settings = await loadSettings();
    const job = await Job.start("seo-suggest-topics");
    try {
      const [siteTitles, topics, posts, big] = await Promise.all([
        existingSiteTitles(),
        db().from("blog_topics").select("working_title"),
        db().from("blog_posts").select("title"),
        db()
          .from("radar_projects")
          .select("id,title,site_town,value_gbp,est_workers_away_from_home")
          .in("status", ["qualified", "lead_created"])
          .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
          .or("value_gbp.gte.20000000,est_workers_away_from_home.gte.30")
          .order("value_gbp", { ascending: false })
          .limit(5),
      ]);
      const existing = [
        ...siteTitles,
        ...((must(topics, "topics") as Array<{ working_title: string }>).map((t) => t.working_title)),
        ...((must(posts, "posts") as Array<{ title: string }>).map((p) => p.title)),
      ];
      const bigProjects = must(big, "big projects") as Array<{ id: string; title: string; site_town: string | null }>;

      const r = await callClaude(claudeContext("seo-suggest-topics", settings), {
        system: TOPICS_SYSTEM,
        user: buildTopicsPrompt({
          existingTitles: existing,
          bigProjects: bigProjects.map((p) => `${p.title}${p.site_town ? ` (${p.site_town})` : ""}`),
          count: 15,
          month: new Date().toLocaleString("en-GB", { month: "long", year: "numeric" }),
        }),
        json: true,
        maxTokens: 4000,
        effort: "low",
      });
      const ideas = validateTopics(r.data, existing).map((t) => ({ ...t, status: "idea" }));

      // Auto-topics from big new Radar projects.
      const taken = [...existing, ...ideas.map((i) => i.working_title)].map(slugify);
      for (const p of bigProjects) {
        const title = `Housing crews for ${p.title}${p.site_town ? ` near ${p.site_town}` : ""}`.slice(0, 100);
        if (taken.some((t) => titleOverlap(t, slugify(title)) > 0.7)) continue;
        ideas.push({ keyword: `accommodation ${p.site_town ?? p.title}`.toLowerCase(), working_title: title, intent: "commercial", priority: 4, source: "radar", status: "idea", project_id: p.id } as (typeof ideas)[number]);
        taken.push(slugify(title));
      }
      if (ideas.length) must(await db().from("blog_topics").insert(ideas), "insert topics");
      job.items = ideas.length;
      job.details = { existing_checked: existing.length, sitemap_posts: siteTitles.length };
      await job.finish("success");
      return json({ added: ideas.length });
    } catch (e) {
      await job.finish("failed", errorMessage(e));
      throw e;
    }
  })
);
