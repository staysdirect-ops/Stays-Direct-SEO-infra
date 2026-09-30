"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/server";

export async function runRadar(backfillDays: number | null): Promise<ActionResult> {
  try {
    await requireRole(["sales"]);
    const r = await invokeFunction(
      "radar-run",
      backfillDays ? { backfill_days: backfillDays } : {}
    );
    return ok(
      `Radar started (run ${r.run_id}). Progress shows in Job Runs; new leads appear in a few minutes.`
    );
  } catch (e) {
    return fail(e);
  }
}

export async function rerunAi(id: string): Promise<ActionResult> {
  try {
    await requireRole(["sales"]);
    await invokeFunction("radar-enrich", { ids: [id] });
    await invokeFunction("radar-match", { ids: [id] });
    revalidatePath("/radar/projects");
    return ok("Re-analysed and re-matched.");
  } catch (e) {
    return fail(e);
  }
}

export async function setProjectRelevance(id: string, relevant: boolean): Promise<ActionResult> {
  try {
    await requireRole(["sales"]);
    const supabase = await createClient();
    const { data: p, error } = await supabase
      .from("radar_projects")
      .select("site_lat,location_confidence")
      .eq("id", id)
      .single();
    if (error) throw error;
    const status = !relevant ? "rejected" : p.site_lat != null ? "qualified" : "needs_review";
    const { error: e2 } = await supabase
      .from("radar_projects")
      .update({
        is_relevant: relevant,
        status,
        matched_at: null,
        relevance_reason: relevant
          ? "Marked relevant by a person."
          : "Marked not relevant by a person.",
      })
      .eq("id", id);
    if (e2) throw e2;
    if (status === "qualified") await invokeFunction("radar-match", { ids: [id] });
    revalidatePath("/radar/projects");
    return ok(
      status === "needs_review"
        ? "Marked relevant. Add a site location before matching."
        : relevant
          ? "Marked relevant and matched."
          : "Rejected."
    );
  } catch (e) {
    return fail(e);
  }
}

export async function setProjectLocation(
  id: string,
  postcode: string,
  town: string
): Promise<ActionResult> {
  try {
    await requireRole(["sales"]);
    const { geocode, toWktPoint } = await import("@staysdirect/core/geo");
    const g = await geocode({ postcode, town });
    if (!g) return fail("Couldn't find that postcode or town.");
    const supabase = await createClient();
    const { error } = await supabase
      .from("radar_projects")
      .update({
        site_postcode: postcode || null,
        site_town: town || null,
        site_location: toWktPoint(g),
        geocode_method: g.method,
        location_confidence: "high",
        status: "qualified",
        is_relevant: true,
        matched_at: null,
      })
      .eq("id", id);
    if (error) throw error;
    await invokeFunction("radar-match", { ids: [id] });
    revalidatePath("/radar/projects");
    return ok(`Located by ${g.method} and matched.`);
  } catch (e) {
    return fail(e);
  }
}

export async function createLeadNow(id: string): Promise<ActionResult> {
  try {
    await requireRole(["sales"]);
    await invokeFunction("radar-match", { ids: [id] });
    const r = await invokeFunction("radar-create-lead", { ids: [id] });
    revalidatePath("/radar/projects");
    revalidatePath("/radar/leads");
    if (Number(r.suppressed))
      return fail("This company asked not to be contacted, so no lead was created.");
    return ok(
      Number(r.exists)
        ? "A lead already exists for this project."
        : "Lead created with draft outreach."
    );
  } catch (e) {
    return fail(e);
  }
}

export interface ProjectDetail {
  raw: unknown;
  matches: Array<{
    distance_miles: number;
    property: {
      id: string;
      name: string;
      town: string;
      bedrooms: number;
      pppn_from: number;
      status: string;
    } | null;
  }>;
  lead: { id: string; status: string } | null;
}

export async function getProjectDetail(id: string): Promise<ProjectDetail> {
  await requireRole(["sales"]);
  const supabase = await createClient();
  const [p, m, l] = await Promise.all([
    supabase.from("radar_projects").select("raw").eq("id", id).single(),
    supabase
      .from("radar_matches")
      .select("distance_miles, property:properties(id,name,town,bedrooms,pppn_from,status)")
      .eq("project_id", id)
      .order("distance_miles"),
    supabase.from("leads").select("id,status").eq("project_id", id).maybeSingle(),
  ]);
  return {
    raw: p.data?.raw ?? null,
    matches: (m.data ?? []) as unknown as ProjectDetail["matches"],
    lead: l.data ?? null,
  };
}

export async function updateLead(
  id: string,
  fields: Record<string, unknown>
): Promise<ActionResult> {
  const allowed = [
    "status",
    "owner",
    "notes",
    "contact_name",
    "contact_role",
    "contact_email",
    "contact_phone",
    "company_website",
    "outreach_subject",
    "outreach_body",
    "linkedin_message",
    "call_script",
  ];
  try {
    await requireRole(["sales"]);
    const clean = Object.fromEntries(
      Object.entries(fields)
        .filter(([k]) => allowed.includes(k))
        .map(([k, v]) => [k, v === "" ? null : v])
    );
    const supabase = await createClient();
    const { error } = await supabase.from("leads").update(clean).eq("id", id);
    if (error) throw error;
    revalidatePath("/radar/leads");
    return ok("Saved.");
  } catch (e) {
    return fail(e);
  }
}
