// Fetches real responses from the external APIs Radar depends on, saves them under
// tests/fixtures/live/, and writes a mapping report. Runs in CI (GitHub runners have internet);
// run locally with: node --experimental-strip-types scripts/fetch-live-samples.ts
import { mkdirSync, writeFileSync } from "node:fs";
import {
  contractsFinderSearchUrl,
  findATenderSearchUrl,
  isAwardRelease,
  mapRelease,
  ocdsDate,
  passesFilter,
  type IngestedProject,
  type OcdsRelease,
  type OcdsReleasePackage,
} from "../packages/core/src/ocds.ts";
import type { RadarSource } from "../packages/core/src/types.ts";
import { bulkLookupPostcodes, geocode } from "../packages/core/src/geo.ts";

const OUT = new URL("../tests/fixtures/live/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const save = (name: string, data: unknown) =>
  writeFileSync(
    new URL(name, OUT),
    typeof data === "string" ? data : JSON.stringify(data, null, 1)
  );
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const now = new Date();
const from = new Date(now.getTime() - 3 * 86_400_000);
const FILTER = { minValueGbp: 500_000, cpvPrefixes: ["45", "71", "50", "51", "65", "76"] };
const report: Record<string, unknown> = {
  fetched_at: now.toISOString(),
  window: { from: ocdsDate(from), to: ocdsDate(now) },
};

async function getJson(
  url: string
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }
  return {
    status: res.status,
    body,
    headers: { "content-type": res.headers.get("content-type") ?? "" },
  };
}

function fieldStats(projects: IngestedProject[]) {
  const pct = (f: (p: IngestedProject) => boolean) =>
    projects.length ? Math.round((projects.filter(f).length / projects.length) * 100) : 0;
  return {
    mapped: projects.length,
    with_value_pct: pct((p) => p.value_gbp != null),
    with_supplier_pct: pct((p) => !!p.supplier_name),
    with_companies_house_pct: pct((p) => !!p.supplier_companies_house_number),
    with_start_date_pct: pct((p) => !!p.start_date),
    with_end_date_pct: pct((p) => !!p.end_date),
    with_cpv_pct: pct((p) => p.cpv_codes.length > 0),
    with_delivery_postcode_pct: pct((p) => p.delivery_postcodes.length > 0),
    with_buyer_postcode_pct: pct((p) => !!p.buyer_postcode),
    with_description_pct: pct((p) => !!p.description),
  };
}

async function sampleSource(source: RadarSource, firstUrl: string, maxPages: number) {
  const pages: unknown[] = [];
  const releases: OcdsRelease[] = [];
  let url: string | null = firstUrl;
  const statuses: number[] = [];
  const nextLinks: Array<string | null> = [];
  for (let i = 0; i < maxPages && url; i++) {
    const r = await getJson(url);
    statuses.push(r.status);
    if (r.status !== 200 || typeof r.body !== "object") {
      pages.push({
        status: r.status,
        body: typeof r.body === "string" ? r.body.slice(0, 2000) : r.body,
      });
      break;
    }
    const pkg = r.body as OcdsReleasePackage & Record<string, unknown>;
    pages.push({
      top_level_keys: Object.keys(pkg),
      links: pkg.links,
      release_count: pkg.releases?.length ?? 0,
    });
    releases.push(...(pkg.releases ?? []));
    const next = pkg.links?.next ?? null;
    nextLinks.push(next);
    url = next && next !== url ? next : null;
    await sleep(1100);
  }
  const awards = releases.filter(isAwardRelease);
  const mapped = releases
    .map((r) => mapRelease(source, r))
    .filter((p): p is IngestedProject => !!p);
  const kept = mapped.filter((p) => passesFilter(p, FILTER));
  const tags: Record<string, number> = {};
  for (const r of releases) for (const t of r.tag ?? []) tags[t] = (tags[t] ?? 0) + 1;
  const releaseKeys: Record<string, number> = {};
  for (const r of releases)
    for (const k of Object.keys(r)) releaseKeys[k] = (releaseKeys[k] ?? 0) + 1;

  // Save a representative sample: every kept release plus a few others, capped for repo size.
  const keptIds = new Set(kept.map((p) => p.raw.id));
  const sample = [
    ...releases.filter((r) => keptIds.has(r.id)).slice(0, 40),
    ...releases.filter((r) => !keptIds.has(r.id)).slice(0, 15),
  ];
  save(`${source}-sample.json`, { releases: sample, links: {} });
  save(`${source}-pages.json`, pages);
  return {
    http_statuses: statuses,
    next_links: nextLinks.map((n) => (n ? n.replace(/cursor=[^&]+/, "cursor=…") : n)),
    releases: releases.length,
    award_releases: awards.length,
    tags,
    release_keys: releaseKeys,
    ...fieldStats(mapped),
    passes_filter: kept.length,
    kept_examples: kept.slice(0, 12).map((p) => ({
      title: p.title,
      supplier: p.supplier_name,
      ch: p.supplier_companies_house_number,
      value: p.value_gbp,
      cpv: p.cpv_codes,
      start: p.start_date,
      delivery: p.delivery_text,
      postcodes: p.delivery_postcodes,
      url: p.source_url,
    })),
  };
}

report.contracts_finder = await sampleSource(
  "contracts_finder",
  contractsFinderSearchUrl(ocdsDate(from), ocdsDate(now)),
  3
).catch((e) => ({ error: String(e) }));
report.find_a_tender = await sampleSource(
  "find_a_tender",
  findATenderSearchUrl(ocdsDate(from), ocdsDate(now)),
  3
).catch((e) => ({ error: String(e) }));

// postcodes.io: single, outcode fallback, place, bulk.
report.postcodes_io = {
  postcode: await geocode({ postcode: "TA5 1UD" }).catch((e) => String(e)),
  terminated_postcode_falls_back: await geocode({ postcode: "TA5 9ZZ", town: "Stogursey" }).catch(
    (e) => String(e)
  ),
  place: await geocode({ town: "Leiston" }).catch((e) => String(e)),
  bulk: Object.fromEntries(
    await bulkLookupPostcodes(["TA5 2LD", "LS1 1UR", "IP16 4UR", "CA20 1PG"]).catch(() => new Map())
  ),
};
save("postcodes-io-bulk.json", (await getJson("https://api.postcodes.io/postcodes/LS11UR")).body);

// Existing blog sitemap (topics must not duplicate it).
const sm = await fetch("https://staysdirect.co.uk/sitemap-blog.xml", {
  signal: AbortSignal.timeout(30_000),
})
  .then(async (r) => ({ status: r.status, text: await r.text() }))
  .catch((e) => ({ status: 0, text: String(e) }));
save("sitemap-blog.xml", sm.text);
const sitemapIndex = await fetch("https://staysdirect.co.uk/sitemap.xml", {
  signal: AbortSignal.timeout(30_000),
})
  .then(async (r) => ({ status: r.status, text: await r.text() }))
  .catch((e) => ({ status: 0, text: String(e) }));
save("sitemap-index.xml", sitemapIndex.text);
const staticMap = await fetch("https://staysdirect.co.uk/sitemap-static.xml", {
  signal: AbortSignal.timeout(30_000),
})
  .then((r) => r.status)
  .catch(() => 0);
report.site = {
  sitemap_blog_status: sm.status,
  blog_urls: [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]),
  sitemap_index_status: sitemapIndex.status,
  sitemap_static_status: staticMap,
};

save("report.json", report);
console.log(
  JSON.stringify(
    report,
    (k, v) => (k === "kept_examples" || k === "release_keys" ? undefined : v),
    2
  )
);
