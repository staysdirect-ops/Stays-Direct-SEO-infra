import { validateLeadForm } from "../_shared/core/index.ts";
import { db, env, handler, HttpError, json, readBody } from "../_shared/runtime.ts";

const MAX_PER_HOUR = 5;

async function ipHash(req: Request): Promise<string> {
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const salt = env("CRON_SECRET") ?? "staysdirect";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

// POST from the website quote form. Inserts a lead with source seo_form (or calculator).
Deno.serve(
  handler(async (req) => {
    if (req.method !== "POST") throw new HttpError(405, "POST only");
    const body = await readBody<Record<string, unknown>>(req);
    const hash = await ipHash(req);
    const { data: allowed, error } = await db().rpc("rate_limit_hit", {
      p_key: `lead:${hash}`,
      p_max: MAX_PER_HOUR,
      p_window_seconds: 3600,
    });
    if (error) throw new Error(error.message);
    if (!allowed)
      return json({ ok: false, error: "Too many requests. Please call us instead." }, 429, {
        "retry-after": "3600",
      });

    const result = validateLeadForm(body);
    if (!result.ok) return json({ ok: false, errors: result.errors }, 400);
    // Honeypot filled: pretend success so bots learn nothing.
    if (result.spam) return json({ ok: true });

    const v = result.value;
    const source = body.source === "calculator" ? "calculator" : "seo_form";
    const { error: insertError } = await db()
      .from("leads")
      .insert({
        source,
        company_name: v.company_name,
        contact_name: v.contact_name,
        contact_email: v.contact_email,
        contact_phone: v.contact_phone,
        contact_role: v.contact_role,
        site_town: v.site_town,
        site_postcode: v.site_postcode,
        est_workers: v.est_workers,
        start_date: v.start_date,
        notes: v.notes,
        landing_page: v.landing_page,
        utm: Object.keys(v.utm).length ? v.utm : null,
        status: "new",
        ip_hash: hash,
      });
    if (insertError) throw new Error(insertError.message);
    return json({ ok: true });
  })
);
