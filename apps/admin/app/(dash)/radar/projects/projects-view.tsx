"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { LazyMap } from "@/components/map-lazy";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Empty, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fmtMoney } from "@/lib/utils";
import {
  createLeadNow,
  getProjectDetail,
  rerunAi,
  setProjectLocation,
  setProjectRelevance,
  type ProjectDetail,
} from "../actions";

export interface ProjectRow {
  id: string;
  source: string;
  source_url: string | null;
  title: string;
  buyer_name: string | null;
  supplier_name: string | null;
  supplier_companies_house_number: string | null;
  value_gbp: number | null;
  award_date: string | null;
  start_date: string | null;
  duration_months: number | null;
  site_location_text: string | null;
  site_town: string | null;
  site_postcode: string | null;
  site_lat: number | null;
  site_lng: number | null;
  location_confidence: string | null;
  relevance_reason: string | null;
  est_workers_min: number | null;
  est_workers_max: number | null;
  est_workers_away_from_home: number | null;
  project_type: string | null;
  status: string;
  score: number | null;
  score_breakdown: Record<string, unknown> | null;
  cpv_codes: string[];
  enrich_error: string | null;
  created_at: string;
}

const TYPES = [
  "rail",
  "road",
  "energy",
  "nuclear",
  "water",
  "data_centre",
  "defence",
  "housing",
  "commercial",
  "education",
  "health",
  "other",
];

export function ProjectsView({
  projects,
  properties,
  radius,
  filters,
}: {
  projects: ProjectRow[];
  properties: Array<{
    id: string;
    name: string;
    town: string;
    lat: number;
    lng: number;
    status: string;
  }>;
  radius: number;
  filters: { status: string; type: string; q: string; min_score: string };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "map">("table");
  const project = projects.find((p) => p.id === selected) ?? null;

  const setFilter = (key: string, value: string) => {
    const sp = new URLSearchParams({ ...filters, [key]: value });
    for (const [k, v] of [...sp.entries()]) if (!v) sp.delete(k);
    router.push(`/radar/projects?${sp.toString()}`);
  };

  const points = useMemo(
    () => [
      ...properties.map((p) => ({
        id: `prop-${p.id}`,
        lat: p.lat,
        lng: p.lng,
        label: `${p.name} (${p.town}) · ${p.status}`,
        kind: "property" as const,
      })),
      ...projects
        .filter((p) => p.site_lat != null && p.site_lng != null)
        .map((p) => ({
          id: p.id,
          lat: p.site_lat!,
          lng: p.site_lng!,
          label: `${p.title} · score ${p.score ?? "—"}`,
          kind: "project" as const,
          radiusMiles: radius,
          highlight: p.id === selected,
        })),
    ],
    [projects, properties, radius, selected]
  );

  return (
    <>
      <Card className="mb-4 p-3">
        <form
          className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter("q", String(new FormData(e.currentTarget).get("q") ?? ""));
          }}
        >
          <Select
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value)}
            aria-label="Status"
          >
            <option value="active">Qualified, review, lead</option>
            <option value="qualified">Qualified</option>
            <option value="needs_review">Needs review</option>
            <option value="lead_created">Lead created</option>
            <option value="new">New (not analysed)</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </Select>
          <Select
            value={filters.type}
            onChange={(e) => setFilter("type", e.target.value)}
            aria-label="Type"
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </Select>
          <Select
            value={filters.min_score}
            onChange={(e) => setFilter("min_score", e.target.value)}
            aria-label="Minimum score"
          >
            <option value="">Any score</option>
            <option value="40">40+</option>
            <option value="60">60+</option>
            <option value="75">75+</option>
          </Select>
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Search title, supplier, town"
            className="col-span-2 sm:col-span-1 lg:col-span-2"
          />
          <div className="col-span-2 flex gap-2 sm:col-span-4 lg:col-span-1">
            <Button type="submit" variant="navy" className="flex-1">
              Filter
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setView(view === "table" ? "map" : "table")}
            >
              {view === "table" ? "Map" : "Table"}
            </Button>
          </div>
        </form>
      </Card>

      {view === "map" ? (
        <Card className="mb-4 p-2">
          <LazyMap points={points} onSelect={setSelected} height={520} />
          <p className="px-2 pt-2 text-xs text-slate-500">
            Orange: projects (click for details). Navy: our properties. The circle shows the{" "}
            {radius}-mile match radius of the selected project.
          </p>
        </Card>
      ) : (
        <Card>
          {projects.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>Score</TH>
                  <TH>Project</TH>
                  <TH className="hidden md:table-cell">Site</TH>
                  <TH className="hidden lg:table-cell">Value</TH>
                  <TH className="hidden lg:table-cell">Away</TH>
                  <TH className="hidden sm:table-cell">Start</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {projects.map((p) => (
                  <TR key={p.id} className="cursor-pointer" onClick={() => setSelected(p.id)}>
                    <TD>
                      <ScoreBadge score={p.score} />
                    </TD>
                    <TD className="max-w-md">
                      <p className="font-medium text-navy">{p.title}</p>
                      <p className="text-xs text-slate-500">
                        {p.supplier_name ?? "Supplier unknown"} ·{" "}
                        {p.project_type?.replace("_", " ") ?? "unclassified"}
                      </p>
                    </TD>
                    <TD className="hidden md:table-cell">
                      {p.site_town ?? "—"}
                      <p className="text-xs text-slate-500">
                        {p.location_confidence ? `${p.location_confidence} confidence` : ""}
                      </p>
                    </TD>
                    <TD className="hidden lg:table-cell">{fmtMoney(p.value_gbp)}</TD>
                    <TD className="hidden lg:table-cell">{p.est_workers_away_from_home ?? "—"}</TD>
                    <TD className="hidden whitespace-nowrap sm:table-cell">
                      {fmtDate(p.start_date)}
                    </TD>
                    <TD>
                      <Badge>{p.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <Empty>No projects match these filters. Try “All”, or run Radar.</Empty>
          )}
        </Card>
      )}

      <Sheet
        open={!!project}
        onOpenChange={(o) => !o && setSelected(null)}
        title={project?.title ?? ""}
        description={
          project
            ? `${project.source.replace("_", " ")} · awarded ${fmtDate(project.award_date)}`
            : undefined
        }
        wide
      >
        {project ? (
          <ProjectDetailPanel project={project} onChanged={() => router.refresh()} />
        ) : null}
      </Sheet>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2">{children}</dd>
    </div>
  );
}

function ProjectDetailPanel({
  project: p,
  onChanged,
}: {
  project: ProjectRow;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [pc, setPc] = useState(p.site_postcode ?? "");
  const [town, setTown] = useState(p.site_town ?? "");
  useEffect(() => {
    let live = true;
    getProjectDetail(p.id).then((d) => live && setDetail(d));
    return () => {
      live = false;
    };
  }, [p.id]);
  const done = (r: { ok: boolean }) => {
    if (r.ok) {
      onChanged();
      getProjectDetail(p.id).then(setDetail);
    }
  };
  const breakdown = p.score_breakdown ?? {};
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <ActionButton variant="outline" size="sm" action={() => rerunAi(p.id)} onDone={done}>
          Re-run AI
        </ActionButton>
        {p.status !== "qualified" && p.status !== "lead_created" ? (
          <ActionButton
            variant="outline"
            size="sm"
            action={() => setProjectRelevance(p.id, true)}
            onDone={done}
          >
            Mark relevant
          </ActionButton>
        ) : null}
        {p.status !== "rejected" ? (
          <ActionButton
            variant="outline"
            size="sm"
            action={() => setProjectRelevance(p.id, false)}
            onDone={done}
          >
            Reject
          </ActionButton>
        ) : null}
        {!detail?.lead ? (
          <ActionButton size="sm" action={() => createLeadNow(p.id)} onDone={done}>
            Create lead
          </ActionButton>
        ) : (
          <a
            href={`/radar/leads?lead=${detail.lead.id}`}
            className="inline-flex h-8 items-center rounded-md bg-navy px-2.5 text-xs font-medium text-white"
          >
            Open lead ({detail.lead.status.replace(/_/g, " ")})
          </a>
        )}
        {p.source_url ? (
          <a
            href={p.source_url}
            target="_blank"
            rel="noopener"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-medium"
          >
            Source notice <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>

      <dl className="divide-y divide-slate-100">
        <Row label="Status">
          <Badge>{p.status}</Badge> <ScoreBadge score={p.score} />
        </Row>
        <Row label="Why">
          {p.relevance_reason ?? "—"}
          {p.enrich_error ? <p className="text-xs text-red-700">{p.enrich_error}</p> : null}
        </Row>
        <Row label="Buyer">{p.buyer_name ?? "—"}</Row>
        <Row label="Supplier">
          {p.supplier_name ?? "—"}
          {p.supplier_companies_house_number ? (
            <span className="text-slate-500"> · CH {p.supplier_companies_house_number}</span>
          ) : null}
        </Row>
        <Row label="Value">{fmtMoney(p.value_gbp, false)}</Row>
        <Row label="Site">
          {[p.site_location_text, p.site_postcode].filter(Boolean).join(" · ") || "—"}{" "}
          {p.location_confidence ? (
            <span className="text-slate-500">({p.location_confidence})</span>
          ) : null}
        </Row>
        <Row label="Crew">
          {p.est_workers_min ?? "?"}–{p.est_workers_max ?? "?"} on site, ~
          {p.est_workers_away_from_home ?? "?"} away from home
        </Row>
        <Row label="Dates">
          {fmtDate(p.start_date)} ·{" "}
          {p.duration_months ? `${p.duration_months} months` : "duration unknown"}
        </Row>
        <Row label="CPV">{p.cpv_codes.join(", ")}</Row>
        <Row label="Score">
          {["value", "workers", "distance", "start", "confidence"].map((k) => (
            <span key={k} className="mr-2 inline-block text-xs text-slate-600">
              {k} {String(breakdown[k] ?? "—")}
            </span>
          ))}
        </Row>
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-navy">Site location</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Postcode">
            <Input value={pc} onChange={(e) => setPc(e.target.value)} />
          </Field>
          <Field label="Town">
            <Input value={town} onChange={(e) => setTown(e.target.value)} />
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <ActionButton
              variant="navy"
              size="sm"
              action={() => setProjectLocation(p.id, pc, town)}
              onDone={done}
            >
              Set location &amp; match
            </ActionButton>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-navy">Our houses within range</h3>
        {!detail ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : detail.matches.length ? (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
            {detail.matches.map((m, i) => (
              <li key={i} className="flex justify-between gap-2 px-3 py-2">
                <span>
                  {m.property?.name}{" "}
                  <span className="text-slate-500">
                    ({m.property?.town}, {m.property?.bedrooms} beds, from £{m.property?.pppn_from})
                  </span>
                </span>
                <span className="whitespace-nowrap font-medium">{m.distance_miles} mi</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No houses in range: a sourcing opportunity.</p>
        )}
      </div>

      <div>
        <Button variant="ghost" size="sm" onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? "Hide" : "Show"} raw notice JSON
        </Button>
        {showRaw ? (
          <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(detail?.raw, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
