"use server";

import { bulkLookupPostcodes, normalizePostcode, toWktPoint } from "@staysdirect/core/geo";
import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/server";

export interface PropertyInput {
  name: string;
  address: string | null;
  town: string | null;
  postcode: string;
  bedrooms: number;
  max_guests: number;
  parking_spaces: number;
  van_parking: boolean;
  pppn_from: number;
  available_from: string | null;
  status: "available" | "occupied" | "offline";
  notes?: string | null;
}

/** Inserts rows with coordinates and town from one postcodes.io bulk lookup per 100 rows. */
export async function importProperties(rows: PropertyInput[]): Promise<ActionResult> {
  try {
    await requireRole(["sales"]);
    if (!rows.length) return fail("Nothing to import.");
    if (rows.length > 2000) return fail("Import at most 2,000 rows at a time.");
    const supabase = await createClient();
    const postcodes = [
      ...new Set(rows.map((r) => normalizePostcode(r.postcode) ?? r.postcode.toUpperCase())),
    ];
    const { data: existing, error: exErr } = await supabase
      .from("properties")
      .select("name,postcode")
      .in("postcode", postcodes);
    if (exErr) throw exErr;
    const seen = new Set(
      (existing ?? []).map((e) => `${e.name.trim().toLowerCase()}|${e.postcode}`)
    );
    const fresh = rows.filter((r) => {
      const key = `${r.name.trim().toLowerCase()}|${normalizePostcode(r.postcode) ?? r.postcode.toUpperCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const skipped = rows.length - fresh.length;
    if (!fresh.length) return ok(`Nothing new: all ${rows.length} rows are already in the list.`);
    const lookup = await bulkLookupPostcodes(
      fresh.map((r) => r.postcode),
      { retry: { retries: 1, timeoutMs: 8000 } }
    ).catch(() => new Map());
    const records = fresh.map((r) => {
      const pc = normalizePostcode(r.postcode) ?? r.postcode.toUpperCase();
      const hit = lookup.get(pc);
      const townFromAddress =
        r.address
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .at(-1) ?? null;
      return {
        ...r,
        postcode: pc,
        town: r.town || hit?.locality || townFromAddress || "Unknown",
        ...(hit
          ? {
              location: toWktPoint(hit),
              geocode_status: "ok",
              geocoded_at: new Date().toISOString(),
            }
          : {}),
      };
    });
    const { error } = await supabase.from("properties").insert(records);
    if (error) throw error;
    revalidatePath("/properties");
    const missed = records.filter((r) => !("location" in r)).length;
    return ok(
      `Imported ${records.length} propert${records.length === 1 ? "y" : "ies"}.${skipped ? ` Skipped ${skipped} already in the list.` : ""}${missed ? ` ${missed} couldn't be located yet and will be retried.` : ""}`
    );
  } catch (e) {
    return fail(e);
  }
}

export async function saveProperty(id: string | null, input: PropertyInput): Promise<ActionResult> {
  try {
    await requireRole(["sales"]);
    const pc = normalizePostcode(input.postcode);
    if (!pc) return fail("Enter a valid UK postcode.");
    if (!input.name.trim()) return fail("Name is required.");
    const supabase = await createClient();
    const record = {
      name: input.name.trim(),
      address: input.address || null,
      town: input.town?.trim() || "Unknown",
      postcode: pc,
      bedrooms: input.bedrooms,
      max_guests: input.max_guests,
      parking_spaces: input.parking_spaces,
      van_parking: input.van_parking,
      pppn_from: input.pppn_from,
      available_from: input.available_from || null,
      status: input.status,
      notes: input.notes || null,
    };
    const { error } = id
      ? await supabase.from("properties").update(record).eq("id", id)
      : await supabase.from("properties").insert(record);
    if (error) throw error;
    revalidatePath("/properties");
    return ok("Saved. Location updates automatically when the postcode changes.");
  } catch (e) {
    return fail(e);
  }
}

export async function setPropertyStatus(id: string, status: string): Promise<ActionResult> {
  try {
    await requireRole(["sales"]);
    const supabase = await createClient();
    const { error } = await supabase.from("properties").update({ status }).eq("id", id);
    if (error) throw error;
    revalidatePath("/properties");
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProperty(id: string): Promise<ActionResult> {
  try {
    await requireRole(["sales"]);
    const supabase = await createClient();
    const { error } = await supabase.from("properties").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/properties");
    return ok("Deleted.");
  } catch (e) {
    return fail(e);
  }
}

export async function retryGeocoding(): Promise<ActionResult> {
  try {
    await requireRole(["sales"]);
    const r = await invokeFunction("geocode", { sweep: true, retry_failed: true });
    revalidatePath("/properties");
    return ok(`Geocoding: ${JSON.stringify(r.results ?? {})}`);
  } catch (e) {
    return fail(e);
  }
}
