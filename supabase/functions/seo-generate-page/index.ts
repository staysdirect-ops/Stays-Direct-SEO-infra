import { generatePage } from "../_shared/seo.ts";
import {
  authorize,
  background,
  errorMessage,
  handler,
  invokeFunction,
  Job,
  json,
  loadSettings,
  readBody,
  HttpError,
} from "../_shared/runtime.ts";

// Generates one page per invocation (Claude calls are slow), then hands the rest of the list to itself.
async function run(ids: string[]): Promise<void> {
  const [id, ...rest] = ids;
  if (!id) return;
  const job = await Job.start("seo-generate-page", { page_id: id, remaining: rest.length });
  try {
    const r = await generatePage(id, await loadSettings());
    job.items = 1;
    job.details = { ...job.details, ...r };
    await job.finish("success");
  } catch (e) {
    await job.finish("failed", errorMessage(e));
    if (errorMessage(e).includes("spend cap")) return;
  }
  if (rest.length) await invokeFunction("seo-generate-page", { page_ids: rest });
}

Deno.serve(
  handler(async (req) => {
    await authorize(req, ["editor"]);
    const body = await readBody<{ page_id?: string; page_ids?: string[] }>(req);
    const ids = body.page_ids ?? (body.page_id ? [body.page_id] : []);
    if (!ids.length) throw new HttpError(400, "page_id or page_ids is required");
    background(run(ids));
    return json({ accepted: true, pages: ids.length }, 202);
  })
);
