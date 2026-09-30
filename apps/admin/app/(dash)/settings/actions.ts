"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function saveSettings(input: Record<string, unknown>): Promise<ActionResult> {
  try {
    await requireRole([]);
    const list = (v: unknown) =>
      String(v ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const num = (v: unknown, min: number, max: number, name: string) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max)
        throw new Error(`${name} must be between ${min} and ${max}`);
      return n;
    };
    let facts: unknown;
    try {
      facts = JSON.parse(String(input.company_facts || "{}"));
    } catch {
      return fail("Company facts must be valid JSON.");
    }
    const update = {
      brand_voice: String(input.brand_voice ?? "").trim(),
      company_facts: facts,
      claude_model: String(input.claude_model).trim(),
      claude_cheap_model: String(input.claude_cheap_model).trim(),
      openai_model: String(input.openai_model).trim(),
      perplexity_model: String(input.perplexity_model).trim(),
      radar_min_value_gbp: num(input.radar_min_value_gbp, 0, 1e10, "Minimum value"),
      radar_match_radius_miles: num(input.radar_match_radius_miles, 1, 200, "Match radius"),
      radar_cpv_prefixes: list(input.radar_cpv_prefixes),
      seo_pages_per_day: num(input.seo_pages_per_day, 0, 100, "Pages per day"),
      blog_posts_per_week: num(input.blog_posts_per_week, 0, 21, "Blog posts per week"),
      daily_ai_spend_cap_usd: num(input.daily_ai_spend_cap_usd, 0, 10000, "Daily spend cap"),
      tracked_brand_names: list(input.tracked_brand_names),
      competitor_names: list(input.competitor_names),
      crons_enabled: input.crons_enabled === true || input.crons_enabled === "on",
    };
    if (!update.radar_cpv_prefixes.length) return fail("Add at least one CPV prefix.");
    const supabase = await createClient();
    const { error } = await supabase.from("settings").update(update).eq("id", 1);
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok("Settings saved.");
  } catch (e) {
    return fail(e);
  }
}
