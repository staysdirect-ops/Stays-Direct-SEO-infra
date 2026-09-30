import { PageHeader } from "@/components/page-header";
import { RunRadar } from "@/components/run-radar";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProjectsView, type ProjectRow } from "./projects-view";

export const metadata = { title: "Radar projects" };

const STATUSES = ["qualified", "needs_review", "new", "lead_created", "rejected"];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole(["sales"]);
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("radar_projects")
    .select(
      "id,source,source_url,title,buyer_name,supplier_name,supplier_companies_house_number,value_gbp,award_date,start_date,duration_months,site_location_text,site_town,site_postcode,site_lat,site_lng,location_confidence,relevance_reason,est_workers_min,est_workers_max,est_workers_away_from_home,project_type,status,score,score_breakdown,cpv_codes,enrich_error,created_at"
    )
    .order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300);
  const status = sp.status ?? "active";
  if (status === "active") q = q.in("status", ["qualified", "needs_review", "lead_created"]);
  else if (STATUSES.includes(status)) q = q.eq("status", status);
  if (sp.type) q = q.eq("project_type", sp.type);
  if (sp.min_score) q = q.gte("score", Number(sp.min_score));
  if (sp.q)
    q = q.or(
      `title.ilike.%${sp.q.replace(/[%,()]/g, " ")}%,supplier_name.ilike.%${sp.q.replace(/[%,()]/g, " ")}%,site_town.ilike.%${sp.q.replace(/[%,()]/g, " ")}%`
    );
  const [{ data: projects, error }, { data: props }, { data: settings }] = await Promise.all([
    q,
    supabase.from("properties").select("id,name,town,lat,lng,status").not("lat", "is", null),
    supabase.from("settings").select("radar_match_radius_miles").single(),
  ]);
  return (
    <>
      <PageHeader
        title="Radar projects"
        description="Newly awarded UK contracts, analysed for site location and crews away from home, matched to our houses."
      >
        <RunRadar />
      </PageHeader>
      {error ? <p className="mb-3 text-sm text-red-700">{error.message}</p> : null}
      <ProjectsView
        projects={(projects ?? []) as ProjectRow[]}
        properties={
          (props ?? []) as Array<{
            id: string;
            name: string;
            town: string;
            lat: number;
            lng: number;
            status: string;
          }>
        }
        radius={Number(settings?.radar_match_radius_miles ?? 25)}
        filters={{ status, type: sp.type ?? "", q: sp.q ?? "", min_score: sp.min_score ?? "" }}
      />
    </>
  );
}
