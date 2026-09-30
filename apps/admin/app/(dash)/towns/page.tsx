import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TownsView, type Town } from "./towns-view";

export const metadata = { title: "Towns" };

export default async function TownsPage() {
  await requireRole(["editor"]);
  const supabase = await createClient();
  const [{ data }, { data: pages }] = await Promise.all([
    supabase
      .from("towns")
      .select(
        "id,name,slug,county,region,population,is_active,avg_hotel_pppn,notes,lat,geocode_status"
      )
      .order("name")
      .limit(2000),
    supabase
      .from("seo_pages")
      .select("town_id,status,published_snapshot")
      .eq("page_type", "location"),
  ]);
  const pageByTown = new Map(
    (pages ?? []).map((p) => [
      p.town_id as string,
      p.published_snapshot ? "live" : (p.status as string),
    ])
  );
  return (
    <>
      <PageHeader
        title="Towns"
        description="Candidate location pages. The typical hotel rate and population appear in public copy and cost tables, so enter real figures; leave blank to omit them."
      />
      <TownsView
        towns={((data ?? []) as Town[]).map((t) => ({ ...t, page: pageByTown.get(t.id) ?? null }))}
      />
    </>
  );
}
