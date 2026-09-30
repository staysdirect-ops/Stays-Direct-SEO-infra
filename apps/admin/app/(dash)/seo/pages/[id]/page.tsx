import { mergeCompanyFacts } from "@staysdirect/core/facts";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageEditor, type EditablePage } from "./page-editor";

export const metadata = { title: "Edit page" };

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["editor"]);
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: page }, { data: settings }] = await Promise.all([
    supabase.from("seo_pages").select("*, town:towns(name)").eq("id", id).maybeSingle(),
    supabase.from("settings").select("company_facts").single(),
  ]);
  if (!page) notFound();
  return (
    <PageEditor
      page={page as unknown as EditablePage}
      facts={mergeCompanyFacts(settings?.company_facts)}
    />
  );
}
