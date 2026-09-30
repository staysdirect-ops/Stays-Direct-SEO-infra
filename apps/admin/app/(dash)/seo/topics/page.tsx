import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TopicsView, type Topic } from "./topics-view";

export const metadata = { title: "Blog topics" };

export default async function TopicsPage() {
  await requireRole(["editor"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("blog_topics")
    .select("*")
    .order("status")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  return (
    <>
      <PageHeader
        title="Blog topics"
        description="Ideas come from the weekly suggestion job (checked against the live blog sitemap) and from big new Radar projects. Queued topics are written first."
      />
      <TopicsView topics={(data ?? []) as Topic[]} />
    </>
  );
}
