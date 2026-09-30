import { generateBlog } from "../_shared/seo.ts";
import { authorize, background, errorMessage, handler, HttpError, invokeFunction, Job, json, loadSettings, readBody } from "../_shared/runtime.ts";

async function run(ids: string[]): Promise<void> {
  const [id, ...rest] = ids;
  if (!id) return;
  const job = await Job.start("seo-generate-blog", { topic_id: id, remaining: rest.length });
  try {
    const r = await generateBlog(id, await loadSettings());
    job.items = 1;
    job.details = { ...job.details, ...r };
    await job.finish("success");
  } catch (e) {
    await job.finish("failed", errorMessage(e));
    if (errorMessage(e).includes("spend cap")) return;
  }
  if (rest.length) await invokeFunction("seo-generate-blog", { topic_ids: rest });
}

Deno.serve(
  handler(async (req) => {
    await authorize(req, ["editor"]);
    const body = await readBody<{ topic_id?: string; topic_ids?: string[] }>(req);
    const ids = body.topic_ids ?? (body.topic_id ? [body.topic_id] : []);
    if (!ids.length) throw new HttpError(400, "topic_id or topic_ids is required");
    background(run(ids));
    return json({ accepted: true, topics: ids.length }, 202);
  })
);
