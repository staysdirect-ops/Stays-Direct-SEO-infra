"use client";

import type { Faq, InternalLink, Section } from "@staysdirect/core/content";
import { renderPageHtml, toRenderable } from "@staysdirect/core/render";
import { publicPath } from "@staysdirect/core/schema";
import type { CompanyFacts } from "@staysdirect/core/types";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { HtmlPreview } from "@/components/html-preview";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { fmtDate } from "@/lib/utils";
import {
  approve,
  publish,
  regeneratePage,
  savePage,
  sendBackToReview,
  unpublish,
} from "../../actions";

export interface EditablePage {
  id: string;
  page_type: "location" | "project";
  slug: string;
  status: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  intro: string | null;
  sections: Section[];
  faqs: Faq[];
  key_facts: Array<{ label: string; value: string }>;
  internal_links: InternalLink[];
  schema_jsonld: unknown;
  quality_score: number | null;
  quality_notes: string[];
  word_count: number | null;
  data_pack: unknown;
  data_pack_hash: string | null;
  published_snapshot: unknown;
  published_at: string | null;
  generated_at: string | null;
  generation_error: string | null;
  project_name: string | null;
  town: { name: string } | null;
}

export function PageEditor({ page, facts }: { page: EditablePage; facts: CompanyFacts }) {
  const router = useRouter();
  const [f, setF] = useState({
    title: page.title ?? "",
    meta_description: page.meta_description ?? "",
    h1: page.h1 ?? "",
    intro: page.intro ?? "",
    sections: page.sections ?? [],
    faqs: page.faqs ?? [],
    key_facts: page.key_facts ?? [],
  });
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [panel, setPanel] = useState<"quality" | "pack" | "schema" | "links">("quality");
  const html = useMemo(
    () =>
      renderPageHtml(
        toRenderable(page.page_type, { ...page, ...f, updated_at: new Date().toISOString() }),
        facts
      ),
    [f, page, facts]
  );
  const name = page.town?.name ?? page.project_name ?? page.slug;
  const empty = !page.generated_at && !f.intro;
  const refresh = (r: { ok: boolean }) => r.ok && router.refresh();
  const setSection = (i: number, s: Partial<Section>) =>
    setF({ ...f, sections: f.sections.map((x, j) => (j === i ? { ...x, ...s } : x)) });
  const setFaq = (i: number, q: Partial<Faq>) =>
    setF({ ...f, faqs: f.faqs.map((x, j) => (j === i ? { ...x, ...q } : x)) });
  const move = <T,>(arr: T[], i: number, d: number) => {
    const next = [...arr];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    return next;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/seo/${page.page_type}`} className="text-xs text-slate-500 hover:underline">
            ← {page.page_type === "location" ? "Location pages" : "Project pages"}
          </Link>
          <h1 className="text-xl font-bold text-navy">{name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge>{page.status}</Badge>
            {page.published_snapshot ? <Badge tone="live">live</Badge> : null}
            <ScoreBadge score={page.quality_score} /> {page.word_count ?? 0} words · generated{" "}
            {fmtDate(page.generated_at, true)}
            {page.published_at ? ` · first published ${fmtDate(page.published_at)}` : ""}
            <span className="font-mono">{publicPath(page.page_type, page.slug)}</span>
          </p>
          {page.generation_error ? (
            <p className="mt-1 text-xs text-red-700">
              Last generation failed: {page.generation_error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ActionButton
            variant="outline"
            action={() => regeneratePage(page.id)}
            confirm={
              empty
                ? undefined
                : "Regenerate replaces the working draft (live copy is unaffected). Continue?"
            }
            onDone={refresh}
          >
            {empty ? "Generate" : "Regenerate"}
          </ActionButton>
          <ActionButton variant="navy" action={() => savePage(page.id, f)} onDone={refresh}>
            Save
          </ActionButton>
          {page.status === "draft" || page.status === "in_review" ? (
            <ActionButton
              variant="outline"
              action={() => approve("seo_pages", page.id)}
              confirm={
                page.status === "draft" ? "This draft scored below 70. Approve anyway?" : undefined
              }
              onDone={refresh}
            >
              Approve
            </ActionButton>
          ) : null}
          {page.status === "approved" ? (
            <>
              <ActionButton action={() => publish("seo_pages", page.id)} onDone={refresh}>
                Publish now
              </ActionButton>
              <ActionButton
                variant="ghost"
                action={() => sendBackToReview("seo_pages", page.id)}
                onDone={refresh}
              >
                Back to review
              </ActionButton>
            </>
          ) : null}
          {page.published_snapshot ? (
            <ActionButton
              variant="destructive"
              action={() => unpublish("seo_pages", page.id)}
              confirm="Take this page offline?"
              onDone={refresh}
            >
              Unpublish
            </ActionButton>
          ) : null}
        </div>
      </div>
      {page.published_snapshot && page.status !== "published" ? (
        <p className="mb-3 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
          The live page still shows the last published version. Approve and publish this draft to
          replace it.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-2 inline-flex rounded-md border border-slate-300 bg-white p-0.5 2xl:hidden">
            {(["preview", "edit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1 text-sm capitalize ${tab === t ? "bg-navy text-white" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="grid gap-4 2xl:grid-cols-2">
            <div className={tab === "edit" ? "" : "hidden 2xl:block"}>
              <Card>
                <CardContent className="space-y-3">
                  <Field label="SEO title" hint={`${f.title.length}/60`}>
                    <Input
                      value={f.title}
                      onChange={(e) => setF({ ...f, title: e.target.value })}
                    />
                  </Field>
                  <Field label="Meta description" hint={`${f.meta_description.length}/155`}>
                    <Textarea
                      rows={2}
                      value={f.meta_description}
                      onChange={(e) => setF({ ...f, meta_description: e.target.value })}
                    />
                  </Field>
                  <Field label="H1">
                    <Input value={f.h1} onChange={(e) => setF({ ...f, h1: e.target.value })} />
                  </Field>
                  <Field label="Intro (answer-first; what AI assistants quote)">
                    <Textarea
                      rows={4}
                      value={f.intro}
                      onChange={(e) => setF({ ...f, intro: e.target.value })}
                    />
                  </Field>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Sections
                    </p>
                    <div className="space-y-3">
                      {f.sections.map((s, i) => (
                        <div key={i} className="rounded-md border border-slate-200 p-2">
                          <div className="mb-2 flex gap-1">
                            <Input
                              value={s.heading}
                              onChange={(e) => setSection(i, { heading: e.target.value })}
                              aria-label="Section heading"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Move up"
                              disabled={i === 0}
                              onClick={() => setF({ ...f, sections: move(f.sections, i, -1) })}
                            >
                              <ArrowUp />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Move down"
                              disabled={i === f.sections.length - 1}
                              onClick={() => setF({ ...f, sections: move(f.sections, i, 1) })}
                            >
                              <ArrowDown />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remove section"
                              onClick={() =>
                                setF({ ...f, sections: f.sections.filter((_, j) => j !== i) })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                          <Textarea
                            rows={8}
                            className="font-mono text-xs"
                            value={s.body_markdown}
                            onChange={(e) => setSection(i, { body_markdown: e.target.value })}
                            aria-label="Section markdown"
                          />
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setF({
                            ...f,
                            sections: [
                              ...f.sections,
                              { heading: "New section", body_markdown: "" },
                            ],
                          })
                        }
                      >
                        <Plus /> Section
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      FAQs ({f.faqs.length})
                    </p>
                    <div className="space-y-2">
                      {f.faqs.map((q, i) => (
                        <div key={i} className="rounded-md border border-slate-200 p-2">
                          <div className="mb-1 flex gap-1">
                            <Input
                              value={q.question}
                              onChange={(e) => setFaq(i, { question: e.target.value })}
                              aria-label="Question"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remove FAQ"
                              onClick={() => setF({ ...f, faqs: f.faqs.filter((_, j) => j !== i) })}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                          <Textarea
                            rows={3}
                            value={q.answer}
                            onChange={(e) => setFaq(i, { answer: e.target.value })}
                            aria-label="Answer"
                          />
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setF({ ...f, faqs: [...f.faqs, { question: "", answer: "" }] })
                        }
                      >
                        <Plus /> FAQ
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className={tab === "preview" ? "" : "hidden 2xl:block"}>
              {empty ? (
                <Card className="p-8 text-center text-sm text-slate-500">
                  Not generated yet. Click Generate.
                </Card>
              ) : (
                <HtmlPreview html={html} />
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <Card>
            <CardHeader className="gap-1">
              {(["quality", "pack", "schema", "links"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPanel(p)}
                  className={`rounded px-2 py-1 text-xs font-medium capitalize ${panel === p ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {p === "pack" ? "Data pack" : p}
                </button>
              ))}
            </CardHeader>
            <CardContent className="text-sm">
              {panel === "quality" ? (
                <div className="space-y-2">
                  <p>
                    Score <ScoreBadge score={page.quality_score} />{" "}
                    <span className="text-xs text-slate-500">(70+ goes to review)</span>
                  </p>
                  {page.quality_notes?.length ? (
                    <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                      {page.quality_notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-emerald-700">No issues found.</p>
                  )}
                  <p className="text-xs text-slate-500">
                    Every number in the copy must appear in the data pack. Save re-runs the rule
                    checks.
                  </p>
                </div>
              ) : null}
              {panel === "pack" ? (
                <>
                  <p className="mb-2 text-xs text-slate-500">
                    Built from our data, not AI. Hash {page.data_pack_hash ?? "—"}.
                  </p>
                  <pre className="max-h-[60vh] overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
                    {JSON.stringify(page.data_pack, null, 2)}
                  </pre>
                </>
              ) : null}
              {panel === "schema" ? (
                <pre className="max-h-[60vh] overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
                  {JSON.stringify(page.schema_jsonld, null, 2)}
                </pre>
              ) : null}
              {panel === "links" ? (
                <ul className="space-y-1 text-xs">
                  {(page.internal_links ?? []).map((l, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <Badge tone="queued">{l.kind}</Badge> {l.label}{" "}
                      <span className="font-mono text-slate-500">{l.href}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Key facts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {f.key_facts.map((k, i) => (
                <p key={i}>
                  <b>{k.value}</b> <span className="text-slate-500">{k.label}</span>
                </p>
              ))}
              <p className="pt-1 text-slate-500">Computed from the data pack when generated.</p>
            </CardContent>
          </Card>
          {page.published_snapshot ? (
            <p className="text-xs text-slate-500">
              <ExternalLink className="mr-1 inline size-3" />
              Public render:{" "}
              <span className="font-mono">
                public-render?path={publicPath(page.page_type, page.slug)}
              </span>
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
