"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Empty, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/utils";
import { addTownPage, queuePages } from "../actions";

export interface PageListRow {
  id: string;
  slug: string;
  status: string;
  name: string;
  title: string | null;
  quality_score: number | null;
  word_count: number | null;
  priority: number;
  live: boolean;
  updated_at: string;
  generation_error: string | null;
}

export function PagesTable({
  kind,
  rows,
  statuses,
  counts,
  current,
  towns,
}: {
  kind: string;
  rows: PageListRow[];
  statuses: string[];
  counts: Record<string, number>;
  current: string;
  towns: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [town, setTown] = useState("");
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <FilterChip
          href={`/seo/${kind}`}
          active={!current}
          label="All"
          count={Object.values(counts).reduce((a, b) => a + b, 0)}
        />
        {statuses.map((s) => (
          <FilterChip
            key={s}
            href={`/seo/${kind}?status=${s}`}
            active={current === s}
            label={s.replace("_", " ")}
            count={counts[s] ?? 0}
          />
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <ActionButton
          disabled={!picked.size}
          action={() => queuePages([...picked])}
          onDone={(r) => r.ok && (setPicked(new Set()), router.refresh())}
        >
          Queue generation ({picked.size})
        </ActionButton>
        {kind === "location" ? (
          <div className="flex flex-wrap items-start gap-2">
            <Select
              value={town}
              onChange={(e) => setTown(e.target.value)}
              className="w-52"
              aria-label="Town"
            >
              <option value="">Add a town page…</option>
              {towns.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <ActionButton
              variant="outline"
              disabled={!town}
              action={() => addTownPage(town)}
              onDone={(r) => r.ok && router.refresh()}
            >
              Add
            </ActionButton>
          </div>
        ) : null}
      </div>
      <Card>
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={picked.size === rows.length}
                    onChange={(e) =>
                      setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                  />
                </TH>
                <TH>{kind === "location" ? "Town" : "Project"}</TH>
                <TH>Status</TH>
                <TH>Quality</TH>
                <TH className="hidden sm:table-cell">Words</TH>
                <TH className="hidden md:table-cell">Priority</TH>
                <TH className="hidden md:table-cell">Updated</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.name}`}
                      checked={picked.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </TD>
                  <TD>
                    <Link
                      href={`/seo/pages/${r.id}`}
                      className="font-medium text-navy hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      /
                      {kind === "location"
                        ? `contractor-accommodation/${r.slug}`
                        : `contractor-accommodation/${r.slug}`}
                    </p>
                    {r.generation_error ? (
                      <p className="text-xs text-red-700">{r.generation_error}</p>
                    ) : null}
                  </TD>
                  <TD className="space-x-1 whitespace-nowrap">
                    <Badge>{r.status}</Badge>
                    {r.live && r.status !== "published" ? <Badge tone="live">live</Badge> : null}
                  </TD>
                  <TD>
                    <ScoreBadge score={r.quality_score} />
                  </TD>
                  <TD className="hidden sm:table-cell">{r.word_count ?? "—"}</TD>
                  <TD className="hidden md:table-cell">{r.priority}</TD>
                  <TD className="hidden whitespace-nowrap text-slate-500 md:table-cell">
                    {fmtDate(r.updated_at)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <Empty>No pages here yet.</Empty>
        )}
      </Card>
    </>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${active ? "border-navy bg-navy text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
    >
      {label} <span className={active ? "text-white/70" : "text-slate-400"}>{count}</span>
    </Link>
  );
}
