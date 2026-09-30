import { HUB_PATH, type PublicKind } from "./core/index.ts";
import { CORS_HEADERS, db, must } from "./runtime.ts";

export const PUBLIC_CACHE = "public, max-age=3600";

export function publicHeaders(contentType: string): Record<string, string> {
  return { "content-type": contentType, "cache-control": PUBLIC_CACHE, ...CORS_HEADERS };
}

/** Maps a site path (/contractor-accommodation/leeds, /contractor-accommodation/projects/x, /blog/y) to kind + slug. */
export function parsePath(path: string): { kind: PublicKind | "hub"; slug: string } | null {
  const clean = path.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  if (clean === HUB_PATH) return { kind: "hub", slug: "" };
  const project = clean.match(new RegExp(`^${HUB_PATH}/projects/([a-z0-9-]+)$`));
  if (project) return { kind: "project", slug: `projects/${project[1]}` };
  const location = clean.match(new RegExp(`^${HUB_PATH}/([a-z0-9-]+)$`));
  if (location) return { kind: "location", slug: location[1]! };
  const blog = clean.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blog) return { kind: "blog", slug: blog[1]! };
  return null;
}

export function normalizeSlug(kind: PublicKind, slug: string): string {
  const s = slug.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (kind === "project") return s.startsWith("projects/") ? s : `projects/${s}`;
  return s;
}

export interface LiveContent {
  kind: PublicKind;
  slug: string;
  snapshot: Record<string, unknown>;
  published_at: string | null;
  updated_at: string | null;
}

export async function findLive(kind: PublicKind, slug: string): Promise<LiveContent | null> {
  const s = normalizeSlug(kind, slug);
  if (!/^(projects\/)?[a-z0-9-]{1,120}$/.test(s)) return null;
  if (kind === "blog") {
    const row = must(
      await db().from("blog_posts").select("slug,published_snapshot,published_at").eq("slug", s).not("published_snapshot", "is", null).maybeSingle(),
      "load post"
    ) as { slug: string; published_snapshot: Record<string, unknown>; published_at: string | null } | null;
    return row ? { kind, slug: row.slug, snapshot: row.published_snapshot, published_at: row.published_at, updated_at: row.published_at } : null;
  }
  const row = must(
    await db()
      .from("seo_pages")
      .select("slug,published_snapshot,published_at,last_refreshed_at")
      .eq("slug", s)
      .eq("page_type", kind)
      .not("published_snapshot", "is", null)
      .maybeSingle(),
    "load page"
  ) as { slug: string; published_snapshot: Record<string, unknown>; published_at: string | null; last_refreshed_at: string | null } | null;
  return row ? { kind, slug: row.slug, snapshot: row.published_snapshot, published_at: row.published_at, updated_at: row.last_refreshed_at ?? row.published_at } : null;
}

export interface IndexRow {
  kind: PublicKind;
  slug: string;
  title: string;
  meta_description: string | null;
  name: string | null;
  updated_at: string | null;
}

export async function liveIndex(): Promise<IndexRow[]> {
  return must(await db().from("published_content").select("kind,slug,title,meta_description,name,updated_at").order("kind").order("slug"), "index") as IndexRow[];
}
