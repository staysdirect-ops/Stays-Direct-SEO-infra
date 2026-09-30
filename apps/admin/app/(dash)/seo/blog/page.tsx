import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Blog" };

export default async function BlogList() {
  await requireRole(["editor"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("blog_posts")
    .select(
      "id,slug,title,status,quality_score,word_count,published_at,published_snapshot,updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(300);
  return (
    <>
      <PageHeader
        title="Blog"
        description="Drafts from the topic queue. Mon/Wed/Fri the scheduler writes the next topics; approve and publish from each post."
      >
        <Link
          href="/seo/topics"
          className="inline-flex h-9 items-center rounded-md bg-orange px-3.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          Topics
        </Link>
      </PageHeader>
      <Card>
        {data?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Title</TH>
                <TH>Status</TH>
                <TH>Quality</TH>
                <TH className="hidden sm:table-cell">Words</TH>
                <TH className="hidden md:table-cell">Updated</TH>
              </tr>
            </THead>
            <TBody>
              {data.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link
                      href={`/seo/blog/${p.id}`}
                      className="font-medium text-navy hover:underline"
                    >
                      {p.title}
                    </Link>
                    <p className="font-mono text-xs text-slate-500">/blog/{p.slug}</p>
                  </TD>
                  <TD className="space-x-1 whitespace-nowrap">
                    <Badge>{p.status}</Badge>
                    {p.published_snapshot && p.status !== "published" ? (
                      <Badge tone="live">live</Badge>
                    ) : null}
                  </TD>
                  <TD>
                    <ScoreBadge score={p.quality_score} />
                  </TD>
                  <TD className="hidden sm:table-cell">{p.word_count ?? "—"}</TD>
                  <TD className="hidden whitespace-nowrap text-slate-500 md:table-cell">
                    {fmtDate(p.updated_at)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <Empty>No posts yet. Queue a topic and click “Write now”.</Empty>
        )}
      </Card>
    </>
  );
}
