"use client";

import { normalizePostcode } from "@staysdirect/core/geo";
import Papa from "papaparse";
import { Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Empty, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/utils";
import {
  deleteProperty,
  importProperties,
  retryGeocoding,
  saveProperty,
  setPropertyStatus,
  type PropertyInput,
} from "./actions";
import type { Photo } from "./photo-types";
import { PropertyPhotos } from "./photos";

export interface Property extends PropertyInput {
  id: string;
  geocode_status: string;
  lat: number | null;
  lng: number | null;
  photos: Photo[];
  updated_at: string;
}

const HEADERS = [
  "name",
  "address",
  "postcode",
  "bedrooms",
  "max_guests",
  "parking_spaces",
  "van_parking",
  "pppn_from",
  "available_from",
  "status",
];
const TEMPLATE = `${HEADERS.join(",")}\nExample House,"12 High Street, Cannington",TA5 2LD,5,5,3,yes,32.00,,available\n`;

function truthy(v: string | undefined): boolean {
  return /^(y|yes|true|1)$/i.test((v ?? "").trim());
}

export function parseCsvRows(text: string): { rows: PropertyInput[]; errors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const errors: string[] = [];
  const missing = ["name", "postcode", "bedrooms", "max_guests", "pppn_from"].filter(
    (h) => !parsed.meta.fields?.includes(h)
  );
  if (missing.length) return { rows: [], errors: [`Missing columns: ${missing.join(", ")}`] };
  const rows: PropertyInput[] = [];
  parsed.data.forEach((r, i) => {
    const line = i + 2;
    const problems: string[] = [];
    const pc = normalizePostcode(r.postcode);
    const beds = Number(r.bedrooms);
    const guests = Number(r.max_guests);
    const price = Number(String(r.pppn_from ?? "").replace(/[£,\s]/g, ""));
    const parking = r.parking_spaces ? Number(r.parking_spaces) : 0;
    const status = (r.status || "available").trim().toLowerCase();
    const avail = (r.available_from ?? "").trim();
    if (!r.name?.trim()) problems.push("name is empty");
    if (!pc) problems.push(`postcode "${r.postcode ?? ""}" is not valid`);
    if (!Number.isInteger(beds) || beds < 1) problems.push("bedrooms must be a whole number");
    if (!Number.isInteger(guests) || guests < 1) problems.push("max_guests must be a whole number");
    if (!(price > 0)) problems.push("pppn_from must be a price");
    if (!Number.isInteger(parking) || parking < 0)
      problems.push("parking_spaces must be a whole number");
    if (!["available", "occupied", "offline"].includes(status))
      problems.push("status must be available, occupied or offline");
    if (avail && !/^\d{4}-\d{2}-\d{2}$/.test(avail))
      problems.push("available_from must be YYYY-MM-DD");
    if (problems.length) {
      errors.push(`Row ${line}: ${problems.join("; ")}`);
      return;
    }
    rows.push({
      name: r.name!.trim(),
      address: r.address?.trim() || null,
      town: r.town?.trim() || null,
      postcode: pc!,
      bedrooms: beds,
      max_guests: guests,
      parking_spaces: parking,
      van_parking: truthy(r.van_parking),
      pppn_from: price,
      available_from: avail || null,
      status: status as PropertyInput["status"],
    });
  });
  for (const e of parsed.errors.slice(0, 5)) errors.push(`Row ${(e.row ?? 0) + 2}: ${e.message}`);
  return { rows, errors };
}

const BLANK: PropertyInput = {
  name: "",
  address: "",
  town: "",
  postcode: "",
  bedrooms: 4,
  max_guests: 4,
  parking_spaces: 0,
  van_parking: false,
  pppn_from: 30,
  available_from: null,
  status: "available",
  notes: "",
};

export function PropertiesView({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const [csv, setCsv] = useState<{ rows: PropertyInput[]; errors: string[]; file: string } | null>(
    null
  );
  const [editing, setEditing] = useState<{ id: string | null; data: PropertyInput } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = (r: { ok: boolean }) => r.ok && router.refresh();
  const unlocated = properties.filter((p) => p.lat == null).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start gap-2">
        <Button onClick={() => setEditing({ id: null, data: BLANK })}>
          <Plus /> Add property
        </Button>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium hover:bg-slate-100">
          <Upload className="size-4" /> Import CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setCsv({ ...parseCsvRows(await file.text()), file: file.name });
              e.target.value = "";
            }}
          />
        </label>
        <a
          className="inline-flex h-9 items-center px-2 text-sm text-navy-700 underline"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
          download="properties-template.csv"
        >
          Template
        </a>
        {unlocated ? (
          <ActionButton variant="outline" action={retryGeocoding} onDone={refresh}>
            Locate {unlocated} missing
          </ActionButton>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          className="mb-4 flex items-start justify-between gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {notice}
          <button className="text-emerald-900 underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      ) : null}
      {csv ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>
              {csv.file}: {csv.rows.length} valid row{csv.rows.length === 1 ? "" : "s"}
              {csv.errors.length ? `, ${csv.errors.length} with problems` : ""}
            </CardTitle>
            <div className="flex gap-2">
              <ActionButton
                disabled={!csv.rows.length}
                action={() => importProperties(csv.rows)}
                onDone={(r) =>
                  r.ok && (setNotice(r.message ?? "Imported."), setCsv(null), router.refresh())
                }
              >
                Import {csv.rows.length}
              </ActionButton>
              <Button variant="ghost" onClick={() => setCsv(null)}>
                Cancel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {csv.errors.length ? (
              <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-xs text-red-700">
                {csv.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-slate-500">
              Rows with problems are skipped. Town and map location come from the postcode.
            </p>
            <div className="max-h-60 overflow-auto">
              <table className="w-full text-xs">
                <tbody>
                  {csv.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1 pr-2">{r.name}</td>
                      <td className="pr-2">{r.postcode}</td>
                      <td className="pr-2">{r.bedrooms} beds</td>
                      <td className="pr-2">£{r.pppn_from}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        {properties.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Property</TH>
                <TH className="hidden sm:table-cell">Beds</TH>
                <TH>From</TH>
                <TH className="hidden md:table-cell">Parking</TH>
                <TH>Status</TH>
                <TH className="hidden lg:table-cell">Location</TH>
              </tr>
            </THead>
            <TBody>
              {properties.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <div className="flex items-start gap-3">
                      {p.photos?.[0] ? (
                        <img
                          src={p.photos[0].url}
                          alt=""
                          loading="lazy"
                          className="hidden size-10 shrink-0 rounded object-cover sm:block"
                        />
                      ) : (
                        <div className="hidden size-10 shrink-0 rounded bg-slate-100 sm:block" />
                      )}
                      <div>
                        <button
                          className="text-left font-medium text-navy hover:underline"
                          onClick={() => setEditing({ id: p.id, data: { ...p } })}
                        >
                          {p.name}
                        </button>
                        <p className="text-xs text-slate-500">
                          {p.town} · {p.postcode}
                          {p.photos?.length
                            ? ` · ${p.photos.length} photo${p.photos.length === 1 ? "" : "s"}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD className="hidden sm:table-cell">
                    {p.bedrooms} <span className="text-slate-500">/ sleeps {p.max_guests}</span>
                  </TD>
                  <TD>£{Number(p.pppn_from).toFixed(2)}</TD>
                  <TD className="hidden md:table-cell">
                    {p.parking_spaces}
                    {p.van_parking ? " · vans" : ""}
                  </TD>
                  <TD>
                    <Select
                      aria-label={`Status of ${p.name}`}
                      value={p.status}
                      className="h-8 w-32 text-xs"
                      onChange={async (e) => refresh(await setPropertyStatus(p.id, e.target.value))}
                    >
                      <option value="available">available</option>
                      <option value="occupied">occupied</option>
                      <option value="offline">offline</option>
                    </Select>
                    {p.status === "occupied" && p.available_from ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        free {fmtDate(p.available_from)}
                      </p>
                    ) : null}
                  </TD>
                  <TD className="hidden lg:table-cell">
                    <Badge
                      tone={
                        p.geocode_status === "failed"
                          ? "failed"
                          : p.lat != null
                            ? "success"
                            : "queued"
                      }
                    >
                      {p.lat != null
                        ? p.geocode_status
                        : p.geocode_status === "failed"
                          ? "not found"
                          : "locating"}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <Empty>No properties yet. Import a CSV to get started.</Empty>
        )}
      </Card>

      <Sheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? "Edit property" : "Add property"}
      >
        {editing ? (
          <PropertyForm
            key={editing.id ?? "new"}
            id={editing.id}
            initial={editing.data}
            photos={editing.id ? (properties.find((p) => p.id === editing.id)?.photos ?? []) : null}
            onDone={() => (setEditing(null), router.refresh())}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function PropertyForm({
  id,
  initial,
  photos,
  onDone,
}: {
  id: string | null;
  initial: PropertyInput;
  photos: Photo[] | null;
  onDone: () => void;
}) {
  const [f, setF] = useState<PropertyInput>(initial);
  const set = <K extends keyof PropertyInput>(k: K, v: PropertyInput[K]) => setF({ ...f, [k]: v });
  return (
    <div className="space-y-3">
      <Field label="Name">
        <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Address">
        <Input value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Town">
          <Input value={f.town ?? ""} onChange={(e) => set("town", e.target.value)} />
        </Field>
        <Field label="Postcode">
          <Input value={f.postcode} onChange={(e) => set("postcode", e.target.value)} />
        </Field>
        <Field label="Bedrooms">
          <Input
            type="number"
            min={1}
            value={f.bedrooms}
            onChange={(e) => set("bedrooms", Number(e.target.value))}
          />
        </Field>
        <Field label="Max guests">
          <Input
            type="number"
            min={1}
            value={f.max_guests}
            onChange={(e) => set("max_guests", Number(e.target.value))}
          />
        </Field>
        <Field label="Parking spaces">
          <Input
            type="number"
            min={0}
            value={f.parking_spaces}
            onChange={(e) => set("parking_spaces", Number(e.target.value))}
          />
        </Field>
        <Field label="From £ pppn">
          <Input
            type="number"
            min={1}
            step="0.01"
            value={f.pppn_from}
            onChange={(e) => set("pppn_from", Number(e.target.value))}
          />
        </Field>
        <Field label="Status">
          <Select
            value={f.status}
            onChange={(e) => set("status", e.target.value as PropertyInput["status"])}
          >
            <option value="available">available</option>
            <option value="occupied">occupied</option>
            <option value="offline">offline</option>
          </Select>
        </Field>
        <Field label="Available from">
          <Input
            type="date"
            value={f.available_from ?? ""}
            onChange={(e) => set("available_from", e.target.value || null)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={f.van_parking}
          onChange={(e) => set("van_parking", e.target.checked)}
        />{" "}
        Van parking
      </label>
      {id && photos ? (
        <PropertyPhotos id={id} initial={photos} />
      ) : (
        <p className="text-xs text-slate-500">Save the property first, then add photos.</p>
      )}
      <Field label="Notes">
        <Textarea rows={3} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2 pt-2">
        <ActionButton action={() => saveProperty(id, f)} onDone={(r) => r.ok && onDone()}>
          Save
        </ActionButton>
        {id ? (
          <ActionButton
            variant="destructive"
            confirm="Delete this property? Its Radar matches go too."
            action={() => deleteProperty(id)}
            onDone={(r) => r.ok && onDone()}
          >
            Delete
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}
