import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, Stat } from "@/components/ui/card";
import { Empty, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { canAccess, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtUsd } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ forbidden?: string }>;
}) {
  const staff = await requireRole(["sales", "editor"]);
  const { forbidden } = await searchParams;
  const supabase = await createClient();
  const sales = canAccess(staff.role, ["sales"]);
  const editor = canAccess(staff.role, ["editor"]);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  const [newLeads, qualified, review, live, settings, spend, jobs, topLeads] = await Promise.all([
    sales
      ? count(
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .gte("created_at", weekAgo)
        )
      : 0,
    sales
      ? count(
          supabase
            .from("radar_projects")
            .select("id", { count: "exact", head: true })
            .eq("status", "qualified")
        )
      : 0,
    editor
      ? count(
          supabase
            .from("seo_pages")
            .select("id", { count: "exact", head: true })
            .eq("status", "in_review")
        )
      : 0,
    editor
      ? count(supabase.from("published_content").select("slug", { count: "exact", head: true }))
      : 0,
    supabase.from("settings").select("daily_ai_spend_cap_usd,crons_enabled").single(),
    supabase.rpc("ai_spend_today_usd"),
    supabase
      .from("job_runs")
      .select("id,job_name,status,started_at,items_processed,error")
      .order("started_at", { ascending: false })
      .limit(8),
    sales
      ? supabase
          .from("leads")
          .select("id,company_name,project_title,site_town,score,status,created_at")
          .in("status", ["new", "researching", "ready"])
          .order("score", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const cap = Number(settings.data?.daily_ai_spend_cap_usd ?? 0);
  const spent = Number(spend.data ?? 0);

  return (
    <>
      <PageHeader title="Dashboard" description="What needs attention today." />
      {forbidden ? (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your role can't open that page.
        </p>
      ) : null}
      {settings.data && !settings.data.crons_enabled ? (
        <p className="mb-4 rounded-md border border-orange/30 bg-orange-50 px-3 py-2 text-sm text-orange-600">
          Scheduled jobs are off. Finish the first-run checklist in docs/RUNBOOK.md, then turn them
          on in{" "}
          <Link className="underline" href="/settings">
            Settings
          </Link>
          .
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {sales ? <Stat label="New leads (7 days)" value={newLeads} /> : null}
        {sales ? (
          <Stat label="Qualified projects" value={qualified} sub="waiting for a lead" />
        ) : null}
        {editor ? <Stat label="Pages to review" value={review} /> : null}
        {editor ? <Stat label="Live pages" value={live} /> : null}
        <Stat
          label="AI spend today"
          value={fmtUsd(spent)}
          sub={`of ${fmtUsd(cap)} cap`}
          tone={spent >= cap * 0.8 ? "bad" : "neutral"}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {sales ? (
          <Card>
            <CardHeader>
              <CardTitle>Best open leads</CardTitle>
              <Link
                href="/radar/leads"
                className="text-xs font-medium text-navy-700 hover:underline"
              >
                All leads
              </Link>
            </CardHeader>
            {topLeads.data?.length ? (
              <Table>
                <THead>
                  <tr>
                    <TH>Score</TH>
                    <TH>Company</TH>
                    <TH className="hidden sm:table-cell">Project</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {topLeads.data.map((l) => (
                    <TR key={String(l.id)}>
                      <TD>
                        <ScoreBadge score={l.score as number} />
                      </TD>
                      <TD className="font-medium">
                        {String(l.company_name ?? "—")}
                        <p className="text-xs font-normal text-slate-500">
                          {String(l.site_town ?? "")}
                        </p>
                      </TD>
                      <TD className="hidden max-w-xs truncate sm:table-cell">
                        {String(l.project_title ?? "")}
                      </TD>
                      <TD>
                        <Badge>{String(l.status)}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <Empty>No open leads yet. Run Radar from the Projects page.</Empty>
            )}
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Recent jobs</CardTitle>
            <Link href="/jobs" className="text-xs font-medium text-navy-700 hover:underline">
              All jobs
            </Link>
          </CardHeader>
          {jobs.data?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>Job</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Items</TH>
                  <TH className="hidden sm:table-cell">Started</TH>
                </tr>
              </THead>
              <TBody>
                {jobs.data.map((j) => (
                  <TR key={j.id}>
                    <TD className="font-medium">
                      {j.job_name}
                      {j.error ? (
                        <p className="max-w-xs truncate text-xs font-normal text-red-700">
                          {j.error}
                        </p>
                      ) : null}
                    </TD>
                    <TD>
                      <Badge>{j.status}</Badge>
                    </TD>
                    <TD className="text-right">{j.items_processed}</TD>
                    <TD className="hidden text-slate-500 sm:table-cell">
                      {fmtDate(j.started_at, true)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <Empty>No jobs have run yet.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
