"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/server";

export async function runVisibilityNow(): Promise<ActionResult> {
  try {
    await requireRole(["editor", "sales"]);
    await invokeFunction("ai-visibility-run", {});
    return ok("Running. Results fill in over the next few minutes.");
  } catch (e) {
    return fail(e);
  }
}

/** Location prompts queue that town's page; others become a blog topic. */
export async function queueOpportunity(promptId: string): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    const supabase = await createClient();
    const { data: p, error } = await supabase
      .from("ai_prompts")
      .select("prompt_text,town_id,town:towns(slug)")
      .eq("id", promptId)
      .single();
    if (error) throw error;
    const town = p.town as unknown as { slug: string } | null;
    if (p.town_id && town) {
      const { data: existing } = await supabase
        .from("seo_pages")
        .select("id,status")
        .eq("town_id", p.town_id)
        .maybeSingle();
      if (existing) {
        const { error: e } = await supabase
          .from("seo_pages")
          .update({
            priority: 95,
            ...(existing.status === "published" ? {} : { status: "queued" }),
          })
          .eq("id", existing.id);
        if (e) throw e;
        return ok(
          existing.status === "published"
            ? "That page is already live; bumped its refresh priority."
            : "Town page moved to the front of the queue."
        );
      }
      const { error: e } = await supabase.from("seo_pages").insert({
        page_type: "location",
        town_id: p.town_id,
        slug: town.slug,
        status: "queued",
        priority: 95,
      });
      if (e) throw e;
      revalidatePath("/seo/location");
      return ok("Town page queued at top priority.");
    }
    const { error: e } = await supabase.from("blog_topics").insert({
      keyword: p.prompt_text.toLowerCase().replace(/\?$/, ""),
      working_title: p.prompt_text.replace(/\?$/, ""),
      intent: "commercial",
      source: "ai_visibility",
      priority: 5,
      status: "queued",
    });
    if (e) throw e;
    revalidatePath("/seo/topics");
    return ok("Queued as a blog topic.");
  } catch (e) {
    return fail(e);
  }
}

export async function addPrompt(text: string, category: string): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    if (!text.trim()) return fail("Enter a prompt.");
    const supabase = await createClient();
    const { error } = await supabase
      .from("ai_prompts")
      .insert({ prompt_text: text.trim(), category });
    if (error) throw error;
    revalidatePath("/visibility");
    return ok("Added.");
  } catch (e) {
    return fail(e);
  }
}

export async function togglePrompt(id: string, active: boolean): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    const supabase = await createClient();
    const { error } = await supabase.from("ai_prompts").update({ is_active: active }).eq("id", id);
    if (error) throw error;
    revalidatePath("/visibility");
    return ok();
  } catch (e) {
    return fail(e);
  }
}
