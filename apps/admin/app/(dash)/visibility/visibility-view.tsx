"use client";

import type { Engine, EngineMetrics } from "@staysdirect/core/visibility";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/sheet";
import { Empty } from "@/components/ui/table";
import { cn, fmtDate } from "@/lib/utils";
import { getAnswer } from "./answer";
import { addPrompt, queueOpportunity, runVisibilityNow, togglePrompt } from "./actions";

// Categorical slots 1-3 of the validated reference palette (blue, orange, aqua), fixed per engine.
const ENGINE_COLOR: Record<Engine, string> = {
  chatgpt: "#2a78d6",
  claude: "#eb6834",
  perplexity: "#1baf7a",
};
const ENGINE_LABEL: Record<Engine, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
};
const ENGINES: Engine[] = ["chatgpt", "claude", "perplexity"];

export interface Cell {
  checkId: number;
  engine: Engine;
  run_at: string;
  mentioned: boolean;
  position: number | null;
  cited: boolean;
  competitors: string[];
  error: string | null;
  sentiment: string | null;
}

export interface PromptRow {
  id: string;
  prompt_text: string;
  category: string;
  is_active: boolean;
  town_id: string | null;
}

function Delta({
  now,
  before,
  pct,
  lowerIsBetter,
}: {
  now: number | null;
  before: number | null | undefined;
  pct?: boolean;
  lowerIsBetter?: boolean;
}) {
  if (now == null || before == null) return <span className="text-slate-500">no prior week</span>;
  const d = now - before;
  if (Math.abs(d) < 0.001) return <span className="text-slate-500">no change vs last week</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  const text = pct
    ? `${d > 0 ? "+" : "−"}${Math.abs(Math.round(d * 100))} pts`
    : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`;
  return (
    <span className={good ? "text-emerald-700" : "text-red-700"}>
      {good ? "▲" : "▼"} {text} vs last week
    </span>
  );
}

/** Cell states carry a text label as well as a fill, so identity never depends on colour alone. */
function cellState(c: Cell | undefined): { label: string; cls: string; title: string } {
  if (!c) return { label: "—", cls: "bg-white text-slate-400", title: "Not checked" };
  if (c.error)
    return {
      label: "Error",
      cls: "bg-white text-red-700 ring-1 ring-inset ring-red-200",
      title: c.error,
    };
  if (c.mentioned && c.cited)
    return {
      label: `#${c.position ?? "?"} cited`,
      cls: "bg-[#1c5cab] text-white",
      title: "Mentioned and our site cited",
    };
  if (c.mentioned)
    return { label: `#${c.position ?? "?"}`, cls: "bg-[#9ec5f4] text-navy", title: "Mentioned" };
  if (c.competitors.length)
    return {
      label: "Rivals only",
      cls: "bg-slate-200 text-slate-700",
      title: `Competitors: ${c.competitors.join(", ")}`,
    };
  return {
    label: "Neither",
    cls: "bg-white text-slate-500 ring-1 ring-inset ring-slate-200",
    title: "No brands named",
  };
}

export function VisibilityView({
  canEdit,
  current,
  previous,
  trend,
  cells,
  prompts,
  sov,
  brand,
  opportunities,
  thisWeek,
}: {
  canEdit: boolean;
  current: EngineMetrics[];
  previous: EngineMetrics[] | null;
  trend: Array<{ week: string } & Record<Engine, number>>;
  cells: Record<string, Cell>;
  prompts: PromptRow[];
  sov: Array<{ name: string; mentions: number; share: number }>;
  brand: string;
  opportunities: Array<{ prompt_id: string; engine: Engine; competitors: string[] }>;
  thisWeek: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<{ prompt: string; cell: Cell } | null>(null);
  const [answer, setAnswer] = useState<Awaited<ReturnType<typeof getAnswer>>>(null);
  const [newPrompt, setNewPrompt] = useState("");
  const [cat, setCat] = useState("general");
  const promptText = new Map(prompts.map((p) => [p.id, p.prompt_text]));
  const showCell = async (prompt: string, cell: Cell) => {
    setOpen({ prompt, cell });
    setAnswer(null);
    setAnswer(await getAnswer(cell.checkId));
  };
  const maxSov = Math.max(1, ...sov.map((s) => s.mentions));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-slate-600">
          {thisWeek ? `Latest week starting ${fmtDate(thisWeek)}.` : "No checks yet."}
        </p>
        <ActionButton
          action={runVisibilityNow}
          onDone={(r) => r.ok && setTimeout(() => router.refresh(), 5000)}
        >
          Run now
        </ActionButton>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {ENGINES.map((e) => {
          const m = current.find((x) => x.engine === e);
          const p = previous?.find((x) => x.engine === e);
          return (
            <Card key={e} className="p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: ENGINE_COLOR[e] }}
                  aria-hidden
                />
                {ENGINE_LABEL[e]}{" "}
                <span className="font-normal normal-case text-slate-400">
                  ({m?.checks ?? 0} prompts)
                </span>
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <dt className="text-xs text-slate-500">Mentioned</dt>
                  <dd className="text-2xl font-bold text-navy">
                    {m?.checks ? `${Math.round(m.mention_rate * 100)}%` : "—"}
                  </dd>
                  <dd className="text-[11px]">
                    <Delta
                      now={m?.checks ? m.mention_rate : null}
                      before={p?.checks ? p.mention_rate : null}
                      pct
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Avg position</dt>
                  <dd className="text-2xl font-bold text-navy">
                    {m?.avg_position != null ? m.avg_position.toFixed(1) : "—"}
                  </dd>
                  <dd className="text-[11px]">
                    <Delta now={m?.avg_position ?? null} before={p?.avg_position} lowerIsBetter />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Cited</dt>
                  <dd className="text-2xl font-bold text-navy">
                    {m?.checks ? `${Math.round(m.citation_rate * 100)}%` : "—"}
                  </dd>
                  <dd className="text-[11px]">
                    <Delta
                      now={m?.checks ? m.citation_rate : null}
                      before={p?.checks ? p.citation_rate : null}
                      pct
                    />
                  </dd>
                </div>
              </dl>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Mention rate by week</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis
                      dataKey="week"
                      tickFormatter={(w: string) => fmtDate(w).slice(0, 6)}
                      tick={{ fontSize: 12, fill: "#52514e" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v: number) => `${v}%`}
                      tick={{ fontSize: 12, fill: "#52514e" }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <Tooltip
                      formatter={(v, name) => [
                        `${v}%`,
                        ENGINE_LABEL[name as Engine] ?? String(name),
                      ]}
                      labelFormatter={(w) => `Week of ${fmtDate(String(w))}`}
                      itemStyle={{ color: "#0b0b0b" }}
                      contentStyle={{ fontSize: 13, borderRadius: 6 }}
                    />
                    <Legend
                      formatter={(v: string) => (
                        <span className="text-xs text-slate-700">{ENGINE_LABEL[v as Engine]}</span>
                      )}
                    />
                    {ENGINES.map((e) => (
                      <Line
                        key={e}
                        type="monotone"
                        dataKey={e}
                        stroke={ENGINE_COLOR[e]}
                        strokeWidth={2}
                        dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty>Run the first check to start the trend.</Empty>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Share of voice (latest week)</CardTitle>
          </CardHeader>
          <CardContent>
            {sov.length ? (
              <ul className="space-y-2">
                {sov.map((s) => (
                  <li key={s.name} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span
                        className={s.name === brand ? "font-semibold text-navy" : "text-slate-700"}
                      >
                        {s.name}
                        {s.name === brand ? " (us)" : ""}
                      </span>
                      <span className="text-slate-600">
                        {Math.round(s.share * 100)}% · {s.mentions}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${(s.mentions / maxSov) * 100}%`,
                          background: s.name === brand ? "#f26b1d" : "#2a78d6",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No brand mentions yet.</Empty>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Prompt × engine (latest answer)</CardTitle>
          <p className="text-xs text-slate-500">
            Click a cell to read the full answer. #n = our position among named brands.
          </p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Prompt</th>
                {ENGINES.map((e) => (
                  <th key={e} className="w-32 px-2 py-2">
                    {ENGINE_LABEL[e]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prompts
                .filter((p) => p.is_active)
                .map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-1.5 text-slate-700">{p.prompt_text}</td>
                    {ENGINES.map((e) => {
                      const c = cells[`${p.id}:${e}`];
                      const s = cellState(c);
                      return (
                        <td key={e} className="p-0.5">
                          <button
                            disabled={!c}
                            title={s.title}
                            onClick={() => c && showCell(p.prompt_text, c)}
                            className={cn(
                              "h-9 w-full rounded text-xs font-semibold",
                              s.cls,
                              c && "hover:outline-2 hover:outline-navy"
                            )}
                          >
                            {s.label}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Opportunities: rivals named, we aren&apos;t</CardTitle>
          </CardHeader>
          {opportunities.length ? (
            <ul className="divide-y divide-slate-100">
              {opportunities.map((o, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="text-slate-800">{promptText.get(o.prompt_id)}</p>
                    <p className="text-xs text-slate-500">
                      {ENGINE_LABEL[o.engine]} named {o.competitors.join(", ")}
                    </p>
                  </div>
                  {canEdit ? (
                    <ActionButton
                      size="sm"
                      variant="outline"
                      action={() => queueOpportunity(o.prompt_id)}
                    >
                      Queue page/topic
                    </ActionButton>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No gaps in the latest checks.</Empty>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              Tracked prompts ({prompts.filter((p) => p.is_active).length} active)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canEdit ? (
              <div className="flex flex-wrap items-start gap-2">
                <Input
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Where can a crew of 10 stay near…"
                  className="min-w-0 flex-1"
                />
                <Select
                  value={cat}
                  onChange={(e) => setCat(e.target.value)}
                  className="w-32"
                  aria-label="Category"
                >
                  <option>general</option>
                  <option>location</option>
                  <option>project</option>
                  <option>cost</option>
                </Select>
                <ActionButton
                  action={() => addPrompt(newPrompt, cat)}
                  onDone={(r) => r.ok && (setNewPrompt(""), router.refresh())}
                >
                  Add
                </ActionButton>
              </div>
            ) : null}
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
              {prompts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className={p.is_active ? "" : "text-slate-400 line-through"}>
                    {p.prompt_text} <Badge tone="queued">{p.category}</Badge>
                  </span>
                  {canEdit ? (
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      action={() => togglePrompt(p.id, !p.is_active)}
                      onDone={(r) => r.ok && router.refresh()}
                    >
                      {p.is_active ? "Pause" : "Resume"}
                    </ActionButton>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Modal
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? `${ENGINE_LABEL[open.cell.engine]}: ${open.prompt}` : ""}
      >
        {open ? (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-500">
              {fmtDate(open.cell.run_at, true)} · {answer?.model ?? ""} ·{" "}
              {open.cell.mentioned ? `we are #${open.cell.position}` : "we are not mentioned"}
              {open.cell.sentiment ? ` · ${open.cell.sentiment}` : ""}
              {open.cell.competitors.length ? ` · rivals: ${open.cell.competitors.join(", ")}` : ""}
            </p>
            <div className="whitespace-pre-wrap rounded-md bg-slate-50 p-3">
              {answer ? (answer.response_text ?? open.cell.error ?? "No answer text.") : "Loading…"}
            </div>
            {answer?.cited_urls?.length ? (
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Cited</p>
                <ul className="list-disc pl-5 text-xs">
                  {answer.cited_urls.map((u) => (
                    <li key={u}>
                      {/^https?:\/\//i.test(u) ? (
                        <a
                          className="text-navy-700 underline"
                          href={u}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {u}
                        </a>
                      ) : (
                        u
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
