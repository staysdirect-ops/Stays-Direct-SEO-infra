import { createRateLimiter, geocode, toWktPoint } from "../_shared/core/index.ts";
import { authorize, db, deadline, handler, json, must, readBody } from "../_shared/runtime.ts";

// Geocodes properties (postcode, then outcode, then town) and towns (by name) via postcodes.io.
// Called by the insert/update triggers with { table, id }, and hourly with { sweep: true }.
const throttle = createRateLimiter(200);

type Table = "properties" | "towns";

async function geocodeRow(table: Table, id: string): Promise<string> {
  const cols = table === "properties" ? "id,postcode,town" : "id,name";
  const row = must(
    await db().from(table).select(cols).eq("id", id).maybeSingle(),
    `load ${table}`
  ) as { id: string; postcode?: string; town?: string; name?: string } | null;
  if (!row) return "missing";
  await throttle();
  const g = await geocode(
    table === "properties" ? { postcode: row.postcode, town: row.town } : { town: row.name }
  ).catch(() => null);
  // Setting location marks the row "manual" in the trigger; override to "ok" in the same update.
  const update = g
    ? {
        location: toWktPoint(g),
        geocode_status: "ok",
        ...(table === "properties" ? { geocoded_at: new Date().toISOString() } : {}),
      }
    : { geocode_status: "failed" };
  must(await db().from(table).update(update).eq("id", id), `update ${table}`);
  return g ? `ok:${g.method}` : "failed";
}

Deno.serve(
  handler(async (req) => {
    await authorize(req, ["sales", "editor"]);
    const body = await readBody<{
      table?: Table;
      id?: string;
      sweep?: boolean;
      retry_failed?: boolean;
    }>(req);
    if (body.table && body.id) {
      if (body.table !== "properties" && body.table !== "towns")
        return json({ error: "table must be properties or towns" }, 400);
      return json({ result: await geocodeRow(body.table, body.id) });
    }
    const statuses = body.retry_failed ? ["pending", "failed"] : ["pending"];
    const outOfTime = deadline(100_000);
    const results: Record<string, number> = {};
    for (const table of ["properties", "towns"] as Table[]) {
      const rows = must(
        await db()
          .from(table)
          .select("id")
          .in("geocode_status", statuses)
          .is("location", null)
          .limit(200),
        `pending ${table}`
      ) as Array<{ id: string }>;
      for (const r of rows) {
        if (outOfTime()) break;
        const res = await geocodeRow(table, r.id);
        results[`${table}:${res}`] = (results[`${table}:${res}`] ?? 0) + 1;
      }
    }
    return json({ results });
  })
);
