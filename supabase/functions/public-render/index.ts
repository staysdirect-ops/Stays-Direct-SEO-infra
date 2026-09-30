import {
  renderHubHtml,
  renderPageHtml,
  toRenderable,
  type PublicKind,
} from "../_shared/core/index.ts";
import { findLive, liveIndex, parsePath, publicHeaders } from "../_shared/public.ts";
import { handler, HttpError, loadSettings } from "../_shared/runtime.ts";

// Full standalone HTML for crawlers and AI bots that don't run JavaScript.
// GET ?path=/contractor-accommodation/leeds  or  ?type=location&slug=leeds
Deno.serve(
  handler(async (req) => {
    if (req.method !== "GET") throw new HttpError(405, "GET only");
    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    const target = path
      ? parsePath(path)
      : url.searchParams.get("type")
        ? {
            kind: url.searchParams.get("type") as PublicKind,
            slug: url.searchParams.get("slug") ?? "",
          }
        : null;
    const html = (body: string, status = 200) =>
      new Response(body, { status, headers: publicHeaders("text/html; charset=utf-8") });
    if (!target || !["hub", "location", "project", "blog"].includes(target.kind)) {
      return html("<!doctype html><title>Not found</title><h1>Not found</h1>", 404);
    }
    const { company_facts } = await loadSettings();
    if (target.kind === "hub") {
      const items = (await liveIndex()).filter((i) => i.kind !== "blog");
      return html(renderHubHtml(items, company_facts));
    }
    const live = await findLive(target.kind as PublicKind, target.slug);
    if (!live) return html("<!doctype html><title>Not found</title><h1>Not found</h1>", 404);
    const page = toRenderable(live.kind, {
      ...(live.snapshot as unknown as Parameters<typeof toRenderable>[1]),
      slug: live.slug,
      updated_at: live.updated_at,
      published_at: live.published_at,
    });
    return html(renderPageHtml(page, company_facts));
  })
);
