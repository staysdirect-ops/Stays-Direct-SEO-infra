import {
  engineMetrics,
  opportunities,
  shareOfVoice,
  weekStart,
  weeklyTrend,
  type CheckRow,
} from "@staysdirect/core/visibility";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VisibilityView, type Cell, type PromptRow } from "./visibility-view";

export const metadata = { title: "AI visibility" };

export default async function VisibilityPage() {
  const staff = await requireRole(["editor", "sales"]);
  const supabase = await createClient();
  const since = new Date(Date.now() - 12 * 7 * 86_400_000).toISOString();
  const [{ data: checks }, { data: prompts }, { data: settings }] = await Promise.all([
    supabase
      .from("ai_visibility_checks")
      .select(
        "id,run_at,prompt_id,engine,model,brand_mentioned,brand_position,brand_cited_url,competitors_mentioned,sentiment,error"
      )
      .gte("run_at", since)
      .order("run_at", { ascending: false })
      .limit(5000),
    supabase
      .from("ai_prompts")
      .select("id,prompt_text,category,is_active,town_id")
      .order("category")
      .order("prompt_text"),
    supabase.from("settings").select("tracked_brand_names").single(),
  ]);
  const rows = (checks ?? []) as Array<
    CheckRow & { id: number; model: string; sentiment: string | null; error: string | null }
  >;
  const weeks = [...new Set(rows.map((r) => weekStart(r.run_at)))].sort();
  const thisWeek = weeks.at(-1);
  const lastWeek = weeks.at(-2);
  const current = engineMetrics(rows.filter((r) => weekStart(r.run_at) === thisWeek && !r.error));
  const previous = lastWeek
    ? engineMetrics(rows.filter((r) => weekStart(r.run_at) === lastWeek && !r.error))
    : null;

  const latest = new Map<string, Cell>();
  for (const r of rows) {
    const k = `${r.prompt_id}:${r.engine}`;
    if (!latest.has(k))
      latest.set(k, {
        checkId: r.id,
        engine: r.engine,
        run_at: r.run_at,
        mentioned: r.brand_mentioned,
        position: r.brand_position,
        cited: !!r.brand_cited_url,
        competitors: r.competitors_mentioned,
        error: r.error,
        sentiment: r.sentiment,
      });
  }
  const brand = settings?.tracked_brand_names?.[0] ?? "StaysDirect";
  const latestRows = rows.filter((r) => weekStart(r.run_at) === thisWeek && !r.error);
  return (
    <>
      <PageHeader
        title="AI visibility"
        description="Weekly checks of what ChatGPT, Claude and Perplexity say when buyers ask about contractor accommodation."
      />
      <VisibilityView
        canEdit={staff.role !== "sales"}
        current={current}
        previous={previous}
        trend={weeklyTrend(rows.filter((r) => !r.error))}
        cells={Object.fromEntries(latest)}
        prompts={(prompts ?? []) as PromptRow[]}
        sov={shareOfVoice(latestRows, brand)}
        brand={brand}
        opportunities={opportunities(rows.filter((r) => !r.error)).map((o) => ({
          prompt_id: o.prompt_id,
          engine: o.engine,
          competitors: o.competitors_mentioned,
        }))}
        thisWeek={thisWeek ?? null}
      />
    </>
  );
}
