import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, Stat } from "@/components/ui/card";
import { Empty, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtUsd } from "@/lib/utils";

export const metadata = { title: "API usage" };

export default async function UsagePage() {
  await requireRole([]);
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data }, { data: today }, { data: settings }] = await Promise.all([
    supabase
      .from("api_usage")
      .select("created_at,provider,model,function_name,input_tokens,output_tokens,est_cost_usd")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000),
    supabase.rpc("ai_spend_today_usd"),
    supabase.from("settings").select("daily_ai_spend_cap_usd").single(),
  ]);
  const rows = data ?? [];
  const byDay = new Map<string, number>();
  const byFn = new Map<string, { calls: number; tokens: number; cost: number; provider: string }>();
  for (const r of rows) {
    const day = new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    byDay.set(day, (byDay.get(day) ?? 0) + Number(r.est_cost_usd));
    const k = `${r.function_name} · ${r.model}`;
    const cur = byFn.get(k) ?? { calls: 0, tokens: 0, cost: 0, provider: r.provider };
    cur.calls++;
    cur.tokens += r.input_tokens + r.output_tokens;
    cur.cost += Number(r.est_cost_usd);
    byFn.set(k, cur);
  }
  const total = rows.reduce((s, r) => s + Number(r.est_cost_usd), 0);
  return (
    <>
      <PageHeader
        title="API usage"
        description="Estimated AI spend from token counts (for the spend cap, not billing). Check provider dashboards for invoices."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Today"
          value={fmtUsd(Number(today ?? 0))}
          sub={`cap ${fmtUsd(Number(settings?.daily_ai_spend_cap_usd ?? 0))}`}
        />
        <Stat label="Last 30 days" value={fmtUsd(total)} />
        <Stat label="Calls (30 days)" value={rows.length.toLocaleString("en-GB")} />
        <Stat label="Average per day" value={fmtUsd(byDay.size ? total / byDay.size : 0)} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>By function and model</CardTitle>
          </CardHeader>
          {byFn.size ? (
            <Table>
              <THead>
                <tr>
                  <TH>Function · model</TH>
                  <TH className="text-right">Calls</TH>
                  <TH className="hidden text-right sm:table-cell">Tokens</TH>
                  <TH className="text-right">Est. cost</TH>
                </tr>
              </THead>
              <TBody>
                {[...byFn.entries()]
                  .sort((a, b) => b[1].cost - a[1].cost)
                  .map(([k, v]) => (
                    <TR key={k}>
                      <TD>
                        {k} <span className="text-xs text-slate-500">({v.provider})</span>
                      </TD>
                      <TD className="text-right">{v.calls}</TD>
                      <TD className="hidden text-right sm:table-cell">
                        {v.tokens.toLocaleString("en-GB")}
                      </TD>
                      <TD className="text-right">{fmtUsd(v.cost)}</TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          ) : (
            <Empty>No AI calls in the last 30 days.</Empty>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By day (UK)</CardTitle>
          </CardHeader>
          {byDay.size ? (
            <Table>
              <TBody>
                {[...byDay.entries()]
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .map(([d, c]) => (
                    <TR key={d}>
                      <TD>{d}</TD>
                      <TD className="text-right">{fmtUsd(c)}</TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          ) : (
            <Empty>—</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
