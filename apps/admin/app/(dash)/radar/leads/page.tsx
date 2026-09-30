import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RunRadar } from "@/components/run-radar";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadsView, type Lead } from "./leads-view";

export const metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; source?: string }>;
}) {
  await requireRole(["sales"]);
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("leads")
    .select("*")
    .order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.source) q = q.eq("source", sp.source);
  const { data, error } = await q;
  return (
    <>
      <PageHeader
        title="Leads"
        description="Drafts are never sent automatically. Review, find a contact, then send from your own inbox."
      >
        <a
          href="/radar/leads/export"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium hover:bg-slate-100"
        >
          <Download className="size-4" /> CSV
        </a>
        <RunRadar />
      </PageHeader>
      {error ? <p className="mb-3 text-sm text-red-700">{error.message}</p> : null}
      <LeadsView
        leads={(data ?? []) as Lead[]}
        initialLead={sp.lead ?? null}
        source={sp.source ?? ""}
      />
    </>
  );
}
