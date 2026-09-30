"use server";

import { slugify } from "@staysdirect/core/text";
import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateTown(
  id: string,
  fields: {
    avg_hotel_pppn: number | null;
    population: number | null;
    is_active: boolean;
    notes: string | null;
  }
): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    const supabase = await createClient();
    const { error } = await supabase.from("towns").update(fields).eq("id", id);
    if (error) throw error;
    revalidatePath("/towns");
    return ok("Saved.");
  } catch (e) {
    return fail(e);
  }
}

export async function addTown(name: string, county: string, region: string): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    if (!name.trim()) return fail("Name is required.");
    const supabase = await createClient();
    const { error } = await supabase.from("towns").insert({
      name: name.trim(),
      slug: slugify(name),
      county: county || null,
      region: region || null,
    });
    if (error)
      throw error.code === "23505" ? new Error("A town with that name already exists.") : error;
    revalidatePath("/towns");
    return ok("Added. It will be located from its name automatically.");
  } catch (e) {
    return fail(e);
  }
}
