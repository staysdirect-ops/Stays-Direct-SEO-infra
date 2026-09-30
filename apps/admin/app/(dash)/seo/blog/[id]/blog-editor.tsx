"use client";

import type { Faq, InternalLink } from "@staysdirect/core/content";
import { renderPageHtml, toRenderable } from "@staysdirect/core/render";
import type { CompanyFacts } from "@staysdirect/core/types";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { HtmlPreview } from "@/components/html-preview";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { approve, publish, saveBlog, sendBackToReview, unpublish } from "../../actions";

export interface EditablePost {
  id: string;
  slug: string;
  title: string;
  meta_description: string | null;
  excerpt: string | null;
  body_markdown: string;
  faqs: Faq[];
  internal_links: InternalLink[];
  schema_jsonld: unknown;
  status: string;
  quality_score: number | null;
  quality_notes: string[];
  word_count: number | null;
  published_snapshot: unknown;
  published_at: string | null;
}

export function BlogEditor({ post, facts }: { post: EditablePost; facts: CompanyFacts }) {
  const router = useRouter();
  const [f, setF] = useState({
    title: post.title,
    meta_description: post.meta_description ?? "",
    excerpt: post.excerpt ?? "",
    body_markdown: post.body_markdown,
    faqs: post.faqs ?? [],
  });
  const html = useMemo(
    () => renderPageHtml(toRenderable("blog", { ...post, ...f, h1: f.title }), facts),
    [f, post, facts]
  );
  const refresh = (r: { ok: boolean }) => r.ok && router.refresh();
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/seo/blog" className="text-xs text-slate-500 hover:underline">
            ← Blog
          </Link>
          <h1 className="text-xl font-bold text-navy">{f.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge>{post.status}</Badge>
            {post.published_snapshot ? <Badge tone="live">live</Badge> : null}
            <ScoreBadge score={post.quality_score} /> {post.word_count ?? 0} words{" "}
            <span className="font-mono">/blog/{post.slug}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ActionButton variant="navy" action={() => saveBlog(post.id, f)} onDone={refresh}>
            Save
          </ActionButton>
          {post.status === "draft" || post.status === "in_review" ? (
            <ActionButton
              variant="outline"
              action={() => approve("blog_posts", post.id)}
              confirm={
                post.status === "draft" ? "This draft scored below 70. Approve anyway?" : undefined
              }
              onDone={refresh}
            >
              Approve
            </ActionButton>
          ) : null}
          {post.status === "approved" ? (
            <>
              <ActionButton action={() => publish("blog_posts", post.id)} onDone={refresh}>
                Publish now
              </ActionButton>
              <ActionButton
                variant="ghost"
                action={() => sendBackToReview("blog_posts", post.id)}
                onDone={refresh}
              >
                Back to review
              </ActionButton>
            </>
          ) : null}
          {post.published_snapshot ? (
            <ActionButton
              variant="destructive"
              action={() => unpublish("blog_posts", post.id)}
              confirm="Take this post offline?"
              onDone={refresh}
            >
              Unpublish
            </ActionButton>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-3">
            <Field label="Title" hint={`${f.title.length}/60`}>
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
            <Field label="Meta description" hint={`${f.meta_description.length}/155`}>
              <Textarea
                rows={2}
                value={f.meta_description}
                onChange={(e) => setF({ ...f, meta_description: e.target.value })}
              />
            </Field>
            <Field label="Excerpt">
              <Textarea
                rows={2}
                value={f.excerpt}
                onChange={(e) => setF({ ...f, excerpt: e.target.value })}
              />
            </Field>
            <Field label="Body (markdown)">
              <Textarea
                rows={28}
                className="font-mono text-xs"
                value={f.body_markdown}
                onChange={(e) => setF({ ...f, body_markdown: e.target.value })}
              />
            </Field>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                FAQs ({f.faqs.length})
              </p>
              {f.faqs.map((q, i) => (
                <div key={i} className="mb-2 rounded-md border border-slate-200 p-2">
                  <div className="mb-1 flex gap-1">
                    <Input
                      value={q.question}
                      onChange={(e) =>
                        setF({
                          ...f,
                          faqs: f.faqs.map((x, j) =>
                            j === i ? { ...x, question: e.target.value } : x
                          ),
                        })
                      }
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
                    onChange={(e) =>
                      setF({
                        ...f,
                        faqs: f.faqs.map((x, j) =>
                          j === i ? { ...x, answer: e.target.value } : x
                        ),
                      })
                    }
                    aria-label="Answer"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setF({ ...f, faqs: [...f.faqs, { question: "", answer: "" }] })}
              >
                <Plus /> FAQ
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>
                Quality <ScoreBadge score={post.quality_score} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {post.quality_notes?.length ? (
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  {post.quality_notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-emerald-700">No issues found.</p>
              )}
            </CardContent>
          </Card>
          <HtmlPreview html={html} />
        </div>
      </div>
    </div>
  );
}
