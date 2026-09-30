import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PagesTable, type PageListRow } from "./pages-table";

const STATUSES = [
  "queued",
  "generating",
  "draft",
  "in_review",
  "approved",
  "published",
  "needs_refresh",
];

export default async function SeoPagesList({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(["editor"]);
  const { kind } = await params;
  if (kind !== "location" && kind !== "project") notFound();
  const { status } = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("seo_pages")
    .select(
      "id,slug,status,title,h1,project_name,quality_score,word_count,priority,published_at,published_snapshot,updated_at,generation_error,town:towns(name)"
    )
    .eq("page_type", kind)
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(500);
  if (status && STATUSES.includes(status)) q = q.eq("status", status);
  const [{ data, error }, counts, towns] = await Promise.all([
    q,
    supabase.from("seo_pages").select("status").eq("page_type", kind),
    kind === "location"
      ? supabase.from("towns").select("id,name").eq("is_active", true).order("name")
      : Promise.resolve({ data: [] }),
  ]);
  const byStatus: Record<string, number> = {};
  for (const r of counts.data ?? []) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const rows: PageListRow[] = (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    status: r.status,
    name:
      kind === "location"
        ? ((r.town as unknown as { name: string } | null)?.name ?? r.slug)
        : (r.project_name ?? r.slug),
    title: r.title,
    quality_score: r.quality_score,
    word_count: r.word_count,
    priority: r.priority,
    live: r.published_snapshot != null,
    updated_at: r.updated_at,
    generation_error: r.generation_error,
  }));
  return (
    <>
      <PageHeader
        title={kind === "location" ? "Location pages" : "Project pages"}
        description={
          kind === "location"
            ? "One page per town, written from local data. Towns near our houses and qualified projects are queued first."
            : "Guides for crews on major projects: the seeded list plus Radar projects worth £20m+ or 30+ workers away from home."
        }
      />
      {error ? <p className="text-sm text-red-700">{error.message}</p> : null}
      <PagesTable
        kind={kind}
        rows={rows}
        statuses={STATUSES}
        counts={byStatus}
        current={status ?? ""}
        towns={(towns.data ?? []) as Array<{ id: string; name: string }>}
      />
    </>
  );
}
