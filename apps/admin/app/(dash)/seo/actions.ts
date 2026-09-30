"use server";

import { allowedNumbers, type DataPack } from "@staysdirect/core/datapack";
import { blogMarkdown, pageMarkdown, type Faq, type Section } from "@staysdirect/core/content";
import { factNumbers, mergeCompanyFacts } from "@staysdirect/core/facts";
import { checkQuality, statusFromQuality } from "@staysdirect/core/quality";
import { toRenderable } from "@staysdirect/core/render";
import { blogSchema, locationSchema, projectSchema } from "@staysdirect/core/schema";
import { stripMarkdown } from "@staysdirect/core/text";
import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/server";

export async function queuePages(ids: string[]): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    if (!ids.length) return fail("Select at least one page.");
    const supabase = await createClient();
    const { error } = await supabase
      .from("seo_pages")
      .update({ status: "queued" })
      .in("id", ids)
      .neq("status", "generating");
    if (error) throw error;
    await invokeFunction("seo-generate-page", { page_ids: ids });
    revalidatePath("/seo", "layout");
    return ok(
      `Generating ${ids.length} page${ids.length === 1 ? "" : "s"}. Each takes about a minute; refresh to see progress.`
    );
  } catch (e) {
    return fail(e);
  }
}

export async function addTownPage(townId: string): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    const supabase = await createClient();
    const { data: town, error } = await supabase
      .from("towns")
      .select("id,slug")
      .eq("id", townId)
      .single();
    if (error) throw error;
    const { error: e2 } = await supabase.from("seo_pages").insert({
      page_type: "location",
      town_id: town.id,
      slug: town.slug,
      status: "queued",
      priority: 50,
    });
    if (e2) throw e2.code === "23505" ? new Error("That town already has a page.") : e2;
    revalidatePath("/seo/location");
    return ok("Queued.");
  } catch (e) {
    return fail(e);
  }
}

export interface PageEdit {
  title: string;
  meta_description: string;
  h1: string;
  intro: string;
  sections: Section[];
  faqs: Faq[];
  key_facts: Array<{ label: string; value: string }>;
}

/** Saves edits and re-runs the rule-based quality check (no AI review) against the page's data pack. */
export async function savePage(id: string, edit: PageEdit): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    const supabase = await createClient();
    const [{ data: page, error }, { data: settings }] = await Promise.all([
      supabase
        .from("seo_pages")
        .select("id,page_type,slug,status,data_pack,project_name,project_town")
        .eq("id", id)
        .single(),
      supabase.from("settings").select("company_facts").single(),
    ]);
    if (error) throw error;
    const facts = mergeCompanyFacts(settings?.company_facts);
    const md = pageMarkdown(edit);
    const pack = page.data_pack as DataPack | null;
    const { data: sim } = await supabase.rpc("seo_similar_pages", {
      p_text: stripMarkdown(md),
      p_exclude_id: id,
      p_limit: 1,
      p_kind: "page",
    });
    const top = (sim as Array<{ slug: string; similarity: number }> | null)?.[0];
    const q = checkQuality({
      kind: page.page_type,
      title: edit.title,
      metaDescription: edit.meta_description,
      bodyMarkdown: md,
      faqCount: edit.faqs.length,
      allowedNumbers: pack ? allowedNumbers(pack) : new Set(factNumbers(facts)),
      maxSimilarity: top?.similarity ?? null,
      mostSimilarSlug: top?.slug ?? null,
    });
    const schema =
      page.page_type === "location" && pack?.kind === "location"
        ? locationSchema({
            townName: pack.town.name,
            county: pack.town.county,
            slug: page.slug,
            description: edit.meta_description,
            faqs: edit.faqs,
            fromPppn: pack.properties.from_pppn,
            facts,
          })
        : projectSchema({
            projectName: page.project_name ?? edit.h1,
            slug: page.slug,
            description: edit.meta_description,
            faqs: edit.faqs,
            nearestTown: page.project_town,
            facts,
          });
    const keepStatus = ["approved", "published"].includes(page.status)
      ? "in_review"
      : page.status === "queued"
        ? "draft"
        : null;
    const { error: e2 } = await supabase
      .from("seo_pages")
      .update({
        ...edit,
        schema_jsonld: schema,
        word_count: q.wordCount,
        quality_score: q.score,
        quality_notes: [...q.notes, "Re-checked after manual edit (rules only, no AI review)."],
        search_text: stripMarkdown(md),
        status:
          keepStatus ??
          (page.status === "draft" || page.status === "in_review"
            ? statusFromQuality(q.score)
            : page.status),
      })
      .eq("id", id);
    if (e2) throw e2;
    revalidatePath(`/seo/pages/${id}`);
    return ok(
      `Saved. Quality ${q.score}/100${q.notes.length ? ` · ${q.notes.length} note${q.notes.length === 1 ? "" : "s"}` : ""}.`
    );
  } catch (e) {
    return fail(e);
  }
}

type Table = "seo_pages" | "blog_posts";

async function setStatus(table: Table, id: string, status: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ status }).eq("id", id);
  if (error) throw error;
}

export async function approve(table: Table, id: string): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    await setStatus(table, id, "approved");
    revalidatePath("/seo", "layout");
    return ok("Approved. It will go live with the next daily publish, or publish now.");
  } catch (e) {
    return fail(e);
  }
}

export async function sendBackToReview(table: Table, id: string): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    await setStatus(table, id, "in_review");
    revalidatePath("/seo", "layout");
    return ok("Moved to review.");
  } catch (e) {
    return fail(e);
  }
}

export async function publish(table: Table, id: string): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    const supabase = await createClient();
    const { data: row, error } = await supabase.from(table).select("*").eq("id", id).single();
    if (error) throw error;
    if (row.status !== "approved" && row.status !== "published")
      return fail("Approve it first: everything goes through the review queue.");
    const now = new Date().toISOString();
    const kind = table === "blog_posts" ? "blog" : (row.page_type as "location" | "project");
    let schema = row.schema_jsonld;
    if (kind === "blog") {
      const { data: s } = await supabase.from("settings").select("company_facts").single();
      schema = blogSchema({
        title: row.title,
        slug: row.slug,
        description: row.meta_description ?? "",
        faqs: row.faqs ?? [],
        publishedAt: row.published_at ?? now,
        updatedAt: now,
        facts: mergeCompanyFacts(s?.company_facts),
      });
    }
    const snapshot = toRenderable(kind, {
      ...row,
      schema_jsonld: schema,
      updated_at: now,
      published_at: row.published_at ?? now,
    });
    const update: Record<string, unknown> = {
      published_snapshot: snapshot,
      status: "published",
      published_at: row.published_at ?? now,
      schema_jsonld: schema,
    };
    if (table === "seo_pages" && row.published_snapshot) update.last_refreshed_at = now;
    const { error: e2 } = await supabase.from(table).update(update).eq("id", id);
    if (e2) throw e2;
    revalidatePath("/seo", "layout");
    return ok("Live on the public endpoints.");
  } catch (e) {
    return fail(e);
  }
}

export async function unpublish(table: Table, id: string): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    const supabase = await createClient();
    const { error } = await supabase
      .from(table)
      .update({ published_snapshot: null, status: "approved" })
      .eq("id", id);
    if (error) throw error;
    revalidatePath("/seo", "layout");
    return ok("Unpublished. The public URL now returns 404.");
  } catch (e) {
    return fail(e);
  }
}

export async function regeneratePage(id: string): Promise<ActionResult> {
  return queuePages([id]);
}

export interface BlogEdit {
  title: string;
  meta_description: string;
  excerpt: string;
  body_markdown: string;
  faqs: Faq[];
}

export async function saveBlog(id: string, edit: BlogEdit): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    const supabase = await createClient();
    const [{ data: post, error }, { data: settings }] = await Promise.all([
      supabase
        .from("blog_posts")
        .select("id,status,topic:blog_topics(keyword,working_title)")
        .eq("id", id)
        .single(),
      supabase.from("settings").select("company_facts").single(),
    ]);
    if (error) throw error;
    const facts = mergeCompanyFacts(settings?.company_facts);
    const topic = post.topic as unknown as { keyword: string; working_title: string } | null;
    const topicNumbers =
      `${topic?.keyword ?? ""} ${topic?.working_title ?? ""} ${edit.title}`
        .match(/\d+(?:\.\d+)?/g)
        ?.map(Number) ?? [];
    const md = blogMarkdown(edit);
    const { data: sim } = await supabase.rpc("seo_similar_pages", {
      p_text: stripMarkdown(md),
      p_exclude_id: id,
      p_limit: 1,
      p_kind: "blog",
    });
    const top = (sim as Array<{ slug: string; similarity: number }> | null)?.[0];
    const q = checkQuality({
      kind: "blog",
      title: edit.title,
      metaDescription: edit.meta_description,
      bodyMarkdown: md,
      faqCount: edit.faqs.length,
      allowedNumbers: new Set([...factNumbers(facts), ...topicNumbers]),
      maxSimilarity: top?.similarity ?? null,
      mostSimilarSlug: top?.slug ?? null,
    });
    const status = ["approved", "published"].includes(post.status)
      ? "in_review"
      : statusFromQuality(q.score);
    const { error: e2 } = await supabase
      .from("blog_posts")
      .update({
        ...edit,
        word_count: q.wordCount,
        quality_score: q.score,
        quality_notes: [...q.notes, "Re-checked after manual edit (rules only)."],
        search_text: stripMarkdown(md),
        status,
      })
      .eq("id", id);
    if (e2) throw e2;
    revalidatePath(`/seo/blog/${id}`);
    return ok(`Saved. Quality ${q.score}/100.`);
  } catch (e) {
    return fail(e);
  }
}

export async function addTopic(
  keyword: string,
  workingTitle: string,
  intent: string
): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    if (!keyword.trim() || !workingTitle.trim()) return fail("Keyword and title are required.");
    const supabase = await createClient();
    const { error } = await supabase.from("blog_topics").insert({
      keyword: keyword.trim(),
      working_title: workingTitle.trim(),
      intent,
      source: "manual",
      priority: 4,
    });
    if (error) throw error;
    revalidatePath("/seo/topics");
    return ok("Added.");
  } catch (e) {
    return fail(e);
  }
}

export async function setTopicStatus(
  id: string,
  status: "idea" | "queued" | "rejected"
): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    const supabase = await createClient();
    const { error } = await supabase.from("blog_topics").update({ status }).eq("id", id);
    if (error) throw error;
    revalidatePath("/seo/topics");
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function writeTopicNow(id: string): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    await invokeFunction("seo-generate-blog", { topic_ids: [id] });
    revalidatePath("/seo/topics");
    return ok("Writing. The draft appears under Blog in a minute or two.");
  } catch (e) {
    return fail(e);
  }
}

export async function suggestTopicsNow(): Promise<ActionResult> {
  try {
    await requireRole(["editor"]);
    const r = await invokeFunction("seo-suggest-topics", {});
    revalidatePath("/seo/topics");
    return ok(`Added ${r.added ?? 0} ideas.`);
  } catch (e) {
    return fail(e);
  }
}
