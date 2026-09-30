import { invokeFunction, authorize, handler, json, readBody, Job, HttpError } from "../_shared/runtime.ts";

// Starts the daily pipeline: ingest (both sources) -> enrich -> match -> create leads.
// Each step logs its own job_runs row and chains to the next; this row gets the rolled-up summary.
Deno.serve(
  handler(async (req) => {
    await authorize(req, ["sales"]);
    const body = await readBody<{ backfill_days?: number | string }>(req);
    const backfill = body.backfill_days == null || body.backfill_days === "" ? undefined : Number(body.backfill_days);
    if (backfill !== undefined && (!Number.isInteger(backfill) || backfill < 1 || backfill > 365)) {
      throw new HttpError(400, "backfill_days must be a whole number from 1 to 365");
    }
    const job = await Job.start("radar-run", { backfill_days: backfill ?? null });
    await invokeFunction("radar-ingest-contracts-finder", { chain: true, run_id: job.id, backfill_days: backfill });
    return json({ run_id: job.id, started: true }, 202);
  })
);
