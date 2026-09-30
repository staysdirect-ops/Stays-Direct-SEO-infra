import {
  ensurePageQueue,
  flagStalePages,
  loadPackInputs,
  nextPagesToGenerate,
  publishApproved,
} from "../_shared/seo.ts";
import {
  authorize,
  db,
  handler,
  HttpError,
  invokeFunction,
  Job,
  json,
  loadSettings,
  must,
  readBody,
} from "../_shared/runtime.ts";

// Scheduled entry point. task=pages (daily), blog (Mon/Wed/Fri) or refresh (monthly).
Deno.serve(
  handler(async (req) => {
    await authorize(req, ["editor"]);
    const { task } = await readBody<{ task?: string }>(req);
    const settings = await loadSettings();
    const job = await Job.start(`seo-run:${task ?? "?"}`);

    if (task === "pages") {
      const inputs = await loadPackInputs();
      const created = await ensurePageQueue(settings.seo_pages_per_day, inputs);
      const ids = await nextPagesToGenerate(settings.seo_pages_per_day);
      if (ids.length) await invokeFunction("seo-generate-page", { page_ids: ids });
      const published = await publishApproved(settings.seo_pages_per_day);
      job.items = ids.length;
      job.details = { queued_new: created, generating: ids.length, published };
    } else if (task === "blog") {
      const perRun = Math.max(1, Math.ceil(settings.blog_posts_per_week / 3));
      const rows = must(
        await db()
          .from("blog_topics")
          .select("id,status")
          .in("status", ["queued", "idea"])
          .order("priority", { ascending: false })
          .order("created_at")
          .limit(50),
        "topics"
      ) as Array<{ id: string; status: string }>;
      const ids = [
        ...rows.filter((r) => r.status === "queued"),
        ...rows.filter((r) => r.status === "idea"),
      ]
        .slice(0, perRun)
        .map((r) => r.id);
      if (ids.length) {
        must(
          await db().from("blog_topics").update({ status: "queued" }).in("id", ids),
          "queue topics"
        );
        await invokeFunction("seo-generate-blog", { topic_ids: ids });
      }
      job.items = ids.length;
      job.details = { generating: ids.length };
    } else if (task === "refresh") {
      const stale = await flagStalePages(settings, await loadPackInputs());
      if (stale.length) await invokeFunction("seo-generate-page", { page_ids: stale });
      job.items = stale.length;
      job.details = { stale: stale.length };
    } else {
      await job.finish("failed", "unknown task");
      throw new HttpError(400, "task must be pages, blog or refresh");
    }
    await job.finish("success");
    return json({ task, ...job.details });
  })
);
