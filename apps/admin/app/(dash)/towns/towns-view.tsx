"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { addTown, updateTown } from "./actions";

export interface Town {
  id: string;
  name: string;
  slug: string;
  county: string | null;
  region: string | null;
  population: number | null;
  is_active: boolean;
  avg_hotel_pppn: number | null;
  notes: string | null;
  lat: number | null;
  geocode_status: string;
  page: string | null;
}

export function TownsView({ towns }: { towns: Town[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [n, setN] = useState({ name: "", county: "", region: "" });
  const shown = useMemo(
    () =>
      towns.filter(
        (t) =>
          (!q || `${t.name} ${t.county} ${t.region}`.toLowerCase().includes(q.toLowerCase())) &&
          (!onlyMissing || t.avg_hotel_pppn == null)
      ),
    [towns, q, onlyMissing]
  );
  return (
    <>
      <Card className="mb-4">
        <CardContent className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field label="New town">
            <Input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
          </Field>
          <Field label="County">
            <Input value={n.county} onChange={(e) => setN({ ...n, county: e.target.value })} />
          </Field>
          <Field label="Region">
            <Input value={n.region} onChange={(e) => setN({ ...n, region: e.target.value })} />
          </Field>
          <ActionButton
            action={() => addTown(n.name, n.county, n.region)}
            onDone={(r) => r.ok && (setN({ name: "", county: "", region: "" }), router.refresh())}
          >
            Add
          </ActionButton>
        </CardContent>
      </Card>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search towns"
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />{" "}
          Missing hotel rate
        </label>
        <span className="text-sm text-slate-500">
          {shown.length} of {towns.length}
        </span>
      </div>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Town</TH>
              <TH>Hotel £ pppn</TH>
              <TH className="hidden sm:table-cell">Population</TH>
              <TH>Active</TH>
              <TH className="hidden md:table-cell">Page</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {shown.map((t) => (
              <TownRow key={t.id} town={t} onSaved={() => router.refresh()} />
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

function TownRow({ town, onSaved }: { town: Town; onSaved: () => void }) {
  const [hotel, setHotel] = useState(town.avg_hotel_pppn?.toString() ?? "");
  const [pop, setPop] = useState(town.population?.toString() ?? "");
  const [active, setActive] = useState(town.is_active);
  const dirty =
    hotel !== (town.avg_hotel_pppn?.toString() ?? "") ||
    pop !== (town.population?.toString() ?? "") ||
    active !== town.is_active;
  return (
    <TR>
      <TD>
        <p className="font-medium text-navy">{town.name}</p>
        <p className="text-xs text-slate-500">
          {[town.county, town.region].filter(Boolean).join(", ")}
          {town.lat == null
            ? ` · ${town.geocode_status === "failed" ? "not located" : "locating"}`
            : ""}
        </p>
      </TD>
      <TD>
        <Input
          aria-label={`Hotel rate for ${town.name}`}
          type="number"
          min={0}
          step="1"
          value={hotel}
          onChange={(e) => setHotel(e.target.value)}
          className="h-8 w-24"
        />
      </TD>
      <TD className="hidden sm:table-cell">
        <Input
          aria-label={`Population of ${town.name}`}
          type="number"
          min={0}
          value={pop}
          onChange={(e) => setPop(e.target.value)}
          className="h-8 w-28"
        />
      </TD>
      <TD>
        <input
          type="checkbox"
          aria-label={`${town.name} active`}
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      </TD>
      <TD className="hidden md:table-cell">
        {town.page ? (
          <Badge tone={town.page === "live" ? "live" : town.page}>{town.page}</Badge>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </TD>
      <TD className="text-right">
        {dirty ? (
          <ActionButton
            size="sm"
            action={() =>
              updateTown(town.id, {
                avg_hotel_pppn: hotel ? Number(hotel) : null,
                population: pop ? Number(pop) : null,
                is_active: active,
                notes: town.notes,
              })
            }
            onDone={(r) => r.ok && onSaved()}
          >
            Save
          </ActionButton>
        ) : null}
      </TD>
    </TR>
  );
}
