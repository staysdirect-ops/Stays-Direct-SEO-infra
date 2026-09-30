import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Job runs" };

function duration(a: string, b: string | null): string {
  if (!b) return "running";
  const s = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
  return s < 90 ? `${s}s` : `${Math.round(s / 60)}m`;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  await requireRole(["sales", "editor"]);
  const { job } = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("job_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(300);
  if (job) q = q.eq("job_name", job);
  const { data } = await q;
  return (
    <>
      <PageHeader
        title="Job runs"
        description="Every scheduled and manual run, with counts and errors. Long jobs appear as several batch rows."
      />
      <Card>
        {data?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Job</TH>
                <TH>Status</TH>
                <TH className="text-right">Items</TH>
                <TH className="hidden sm:table-cell">Started</TH>
                <TH className="hidden sm:table-cell">Took</TH>
                <TH className="hidden lg:table-cell">Details</TH>
              </tr>
            </THead>
            <TBody>
              {data.map((j) => (
                <TR key={j.id}>
                  <TD>
                    <a
                      href={`/jobs?job=${encodeURIComponent(j.job_name)}`}
                      className="font-medium text-navy hover:underline"
                    >
                      {j.job_name}
                    </a>
                    {j.error ? <p className="max-w-md text-xs text-red-700">{j.error}</p> : null}
                  </TD>
                  <TD>
                    <Badge>{j.status}</Badge>
                  </TD>
                  <TD className="text-right">{j.items_processed}</TD>
                  <TD className="hidden whitespace-nowrap sm:table-cell">
                    {fmtDate(j.started_at, true)}
                  </TD>
                  <TD className="hidden sm:table-cell">{duration(j.started_at, j.finished_at)}</TD>
                  <TD className="hidden max-w-lg lg:table-cell">
                    <code
                      className="block truncate text-xs text-slate-500"
                      title={JSON.stringify(j.details)}
                    >
                      {JSON.stringify(j.details)}
                    </code>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <Empty>No runs yet.</Empty>
        )}
      </Card>
    </>
  );
}
