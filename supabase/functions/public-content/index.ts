import { canonicalUrl, publicPath, type PublicKind } from "../_shared/core/index.ts";
import { findLive, liveIndex, publicHeaders } from "../_shared/public.ts";
import { handler, HttpError, json } from "../_shared/runtime.ts";

// GET ?type=index | ?type=location|project|blog&slug=...  Published content only.
Deno.serve(
  handler(async (req) => {
    if (req.method !== "GET") throw new HttpError(405, "GET only");
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const headers = publicHeaders("application/json; charset=utf-8");
    if (type === "index") {
      const items = (await liveIndex()).map((i) => ({ ...i, path: publicPath(i.kind, i.slug), url: canonicalUrl(i.kind, i.slug) }));
      return json({ items }, 200, headers);
    }
    if (type !== "location" && type !== "project" && type !== "blog") throw new HttpError(400, "type must be index, location, project or blog");
    const slug = url.searchParams.get("slug");
    if (!slug) throw new HttpError(400, "slug is required");
    const live = await findLive(type as PublicKind, slug);
    if (!live) return json({ error: "Not found" }, 404, { ...headers, "cache-control": "public, max-age=300" });
    return json(
      { ...live.snapshot, kind: live.kind, slug: live.slug, path: publicPath(live.kind, live.slug), canonical_url: canonicalUrl(live.kind, live.slug), published_at: live.published_at, updated_at: live.updated_at },
      200,
      headers
    );
  })
);
