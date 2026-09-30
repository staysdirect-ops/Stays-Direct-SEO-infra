import { llmsTxt } from "../_shared/core/index.ts";
import { liveIndex, publicHeaders } from "../_shared/public.ts";
import { db, handler, loadSettings } from "../_shared/runtime.ts";

Deno.serve(
  handler(async () => {
    const [items, settings, towns] = await Promise.all([
      liveIndex(),
      loadSettings(),
      db().from("towns").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    const txt = llmsTxt({
      facts: settings.company_facts,
      locations: items.filter((i) => i.kind === "location"),
      projects: items.filter((i) => i.kind === "project"),
      blog: items.filter((i) => i.kind === "blog"),
      townCount: towns.count ?? 0,
    });
    return new Response(txt, { headers: publicHeaders("text/plain; charset=utf-8") });
  })
);
