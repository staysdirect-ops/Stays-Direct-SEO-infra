import { mergeCompanyFacts } from "@staysdirect/core/facts";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BlogEditor, type EditablePost } from "./blog-editor";

export const metadata = { title: "Edit post" };

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["editor"]);
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: post }, { data: settings }] = await Promise.all([
    supabase.from("blog_posts").select("*").eq("id", id).maybeSingle(),
    supabase.from("settings").select("company_facts").single(),
  ]);
  if (!post) notFound();
  return (
    <BlogEditor post={post as EditablePost} facts={mergeCompanyFacts(settings?.company_facts)} />
  );
}
