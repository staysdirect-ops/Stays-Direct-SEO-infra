"use client";

import { Mail, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { CopyButton } from "@/components/copy-button";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Empty, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { updateLead } from "../actions";

export interface Lead {
  id: string;
  created_at: string;
  source: string;
  company_name: string | null;
  companies_house_number: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  company_website: string | null;
  project_id: string | null;
  project_title: string | null;
  site_town: string | null;
  site_postcode: string | null;
  est_workers: number | null;
  start_date: string | null;
  value_gbp: number | null;
  matched_property_ids: string[];
  nearest_property_miles: number | null;
  outreach_subject: string | null;
  outreach_body: string | null;
  linkedin_message: string | null;
  call_script: string | null;
  score: number | null;
  flags: string[];
  status: string;
  notes: string | null;
  landing_page: string | null;
  utm: Record<string, string> | null;
}

export const LEAD_STATUSES = [
  "new",
  "researching",
  "ready",
  "contacted",
  "replied",
  "quoted",
  "won",
  "lost",
  "do_not_contact",
];
const BOARD = ["new", "researching", "ready", "contacted", "replied", "quoted"];

export function LeadsView({
  leads,
  initialLead,
  source,
}: {
  leads: Lead[];
  initialLead: string | null;
  source: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"board" | "table">("board");
  const [selected, setSelected] = useState<string | null>(initialLead);
  const lead = leads.find((l) => l.id === selected) ?? null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {(["board", "table"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded px-3 py-1 text-sm capitalize ${view === v ? "bg-navy text-white" : "text-slate-700"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <Select
          value={source}
          onChange={(e) =>
            router.push(e.target.value ? `/radar/leads?source=${e.target.value}` : "/radar/leads")
          }
          className="w-44"
          aria-label="Source"
        >
          <option value="">All sources</option>
          <option value="radar">Radar</option>
          <option value="seo_form">Website form</option>
          <option value="calculator">Calculator</option>
          <option value="manual">Manual</option>
        </Select>
        <span className="text-sm text-slate-500">{leads.length} leads</span>
      </div>

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid min-w-[1100px] grid-cols-6 gap-3">
            {BOARD.map((status) => {
              const col = leads.filter((l) => l.status === status);
              return (
                <div key={status} className="rounded-lg bg-slate-100 p-2">
                  <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {status.replace("_", " ")}{" "}
                    <span className="rounded-full bg-white px-1.5">{col.length}</span>
                  </p>
                  <div className="space-y-2">
                    {col.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setSelected(l.id)}
                        className="block w-full rounded-md border border-slate-200 bg-white p-2.5 text-left text-sm shadow-xs hover:border-orange"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-navy">
                            {l.company_name ?? l.contact_name ?? "Unknown"}
                          </p>
                          <ScoreBadge score={l.score} />
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                          {l.project_title ?? l.notes ?? ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {l.site_town ?? "—"}
                          {l.nearest_property_miles != null
                            ? ` · ${l.nearest_property_miles} mi`
                            : ""}
                          {l.source !== "radar" ? ` · ${l.source.replace("_", " ")}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Won, lost and do-not-contact leads are in the table view.
          </p>
        </div>
      ) : (
        <Card>
          {leads.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>Score</TH>
                  <TH>Company</TH>
                  <TH className="hidden md:table-cell">Project</TH>
                  <TH className="hidden lg:table-cell">Nearest</TH>
                  <TH className="hidden sm:table-cell">Created</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {leads.map((l) => (
                  <TR key={l.id} className="cursor-pointer" onClick={() => setSelected(l.id)}>
                    <TD>
                      <ScoreBadge score={l.score} />
                    </TD>
                    <TD className="font-medium">
                      {l.company_name ?? l.contact_name ?? "—"}
                      <p className="text-xs font-normal text-slate-500">{l.site_town ?? ""}</p>
                    </TD>
                    <TD className="hidden max-w-sm md:table-cell">{l.project_title ?? "—"}</TD>
                    <TD className="hidden lg:table-cell">
                      {l.nearest_property_miles != null ? `${l.nearest_property_miles} mi` : "—"}
                    </TD>
                    <TD className="hidden whitespace-nowrap sm:table-cell">
                      {fmtDate(l.created_at)}
                    </TD>
                    <TD>
                      <Badge>{l.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <Empty>No leads yet. Run Radar, or wait for the website form.</Empty>
          )}
        </Card>
      )}

      <Sheet
        open={!!lead}
        onOpenChange={(o) => !o && setSelected(null)}
        title={lead?.company_name ?? lead?.contact_name ?? "Lead"}
        description={lead?.project_title ?? lead?.source}
        wide
      >
        {lead ? <LeadEditor key={lead.id} lead={lead} onSaved={() => router.refresh()} /> : null}
      </Sheet>
    </>
  );
}

function LeadEditor({ lead, onSaved }: { lead: Lead; onSaved: () => void }) {
  const [f, setF] = useState({
    status: lead.status,
    contact_name: lead.contact_name ?? "",
    contact_role: lead.contact_role ?? "",
    contact_email: lead.contact_email ?? "",
    contact_phone: lead.contact_phone ?? "",
    company_website: lead.company_website ?? "",
    outreach_subject: lead.outreach_subject ?? "",
    outreach_body: lead.outreach_body ?? "",
    linkedin_message: lead.linkedin_message ?? "",
    call_script: lead.call_script ?? "",
    notes: lead.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const firstName = f.contact_name.split(/\s+/)[0] ?? "";
  const body = f.outreach_body.replace("{first_name}", firstName || "there");
  const mailto = `mailto:${encodeURIComponent(f.contact_email)}?subject=${encodeURIComponent(f.outreach_subject)}&body=${encodeURIComponent(body)}`;
  const company = lead.company_name ?? "";
  const google = `https://www.google.com/search?q=${encodeURIComponent(`${company} ${lead.site_town ?? ""} project manager`)}`;
  const linkedin = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} project manager`)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ScoreBadge score={lead.score} />
        {lead.flags.map((fl) => (
          <Badge key={fl} tone="needs_review">
            {fl}
          </Badge>
        ))}
        <span className="text-slate-500">
          {lead.site_town ?? ""} {lead.site_postcode ?? ""} · {fmtMoney(lead.value_gbp)} · start{" "}
          {fmtDate(lead.start_date)} · ~{lead.est_workers ?? "?"} workers
          {lead.nearest_property_miles != null
            ? ` · nearest house ${lead.nearest_property_miles} mi (${lead.matched_property_ids.length} in range)`
            : ""}
        </span>
      </div>
      {lead.source !== "radar" ? (
        <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
          From {lead.source.replace("_", " ")} {lead.landing_page ? `on ${lead.landing_page}` : ""}{" "}
          {lead.utm
            ? `· ${Object.entries(lead.utm)
                .map(([k, v]) => `${k}=${v}`)
                .join(" ")}`
            : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <a
          href={google}
          target="_blank"
          rel="noopener"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-medium"
        >
          <Search className="size-3.5" /> Find contact (Google)
        </a>
        <a
          href={linkedin}
          target="_blank"
          rel="noopener"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-medium"
        >
          <Search className="size-3.5" /> LinkedIn people
        </a>
        {lead.companies_house_number ? (
          <a
            href={`https://find-and-update.company-information.service.gov.uk/company/${lead.companies_house_number}`}
            target="_blank"
            rel="noopener"
            className="inline-flex h-8 items-center rounded-md border border-slate-300 px-2.5 text-xs font-medium"
          >
            Companies House
          </a>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Status">
          <Select value={f.status} onChange={set("status")}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact name">
          <Input value={f.contact_name} onChange={set("contact_name")} />
        </Field>
        <Field label="Role">
          <Input value={f.contact_role} onChange={set("contact_role")} />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.contact_email} onChange={set("contact_email")} />
        </Field>
        <Field label="Phone">
          <Input value={f.contact_phone} onChange={set("contact_phone")} />
        </Field>
        <Field label="Website">
          <Input value={f.company_website} onChange={set("company_website")} />
        </Field>
      </div>
      {f.status === "do_not_contact" ? (
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-800">
          Do not contact also stops Radar creating new leads for this company.
        </p>
      ) : null}

      <div className="space-y-3">
        <Field label="Email subject">
          <Input value={f.outreach_subject} onChange={set("outreach_subject")} />
        </Field>
        <Field
          label="Email body"
          hint={`${f.outreach_body.split(/\s+/).filter(Boolean).length} words. {first_name} is replaced from the contact name.`}
        >
          <Textarea rows={11} value={f.outreach_body} onChange={set("outreach_body")} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={`${f.outreach_subject}\n\n${body}`} label="Copy email" />
          <a
            href={mailto}
            className={`inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-medium ${f.contact_email ? "" : "pointer-events-none opacity-50"}`}
          >
            <Mail className="size-3.5" /> Open in email
          </a>
        </div>
        <Field label="LinkedIn message" hint={`${f.linkedin_message.length}/300 characters`}>
          <Textarea rows={3} value={f.linkedin_message} onChange={set("linkedin_message")} />
        </Field>
        <CopyButton text={f.linkedin_message} label="Copy LinkedIn" />
        <Field label="Call script">
          <Textarea rows={6} value={f.call_script} onChange={set("call_script")} />
        </Field>
        <Field label="Notes">
          <Textarea rows={3} value={f.notes} onChange={set("notes")} />
        </Field>
      </div>

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-slate-200 bg-white px-4 py-3">
        <ActionButton action={() => updateLead(lead.id, f)} onDone={(r) => r.ok && onSaved()}>
          Save
        </ActionButton>
        <Button variant="ghost" onClick={() => setF({ ...f, status: "do_not_contact" })}>
          Mark do not contact
        </Button>
      </div>
    </div>
  );
}
