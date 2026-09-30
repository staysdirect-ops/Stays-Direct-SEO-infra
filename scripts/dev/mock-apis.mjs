#!/usr/bin/env node
// Local stand-in for every external API, backed by tests/fixtures. Used with DEV_EXTERNAL_API_PROXY
// for end-to-end runs of the edge functions without network access or API keys.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const F = fileURLToPath(new URL("../../tests/fixtures/", import.meta.url));
const load = (p) => JSON.parse(readFileSync(F + p, "utf8"));
const text = (p) => readFileSync(F + p, "utf8");
const PORT = Number(process.env.MOCK_PORT ?? 8787);
const log = [];

const POSTCODES = {
  "TA5 2LD": [51.149687, -3.064713, "Somerset"],
  "TA5 1UD": [51.2089, -3.1334, "Somerset"],
  "CA14 5QD": [54.6108, -3.5664, "Cumberland"],
  "CA20 1PG": [54.4205, -3.4975, "Cumberland"],
};
const PLACES = {
  lowestoft: [52.47559, 1.7512],
  saxmundham: [52.215, 1.491],
  "barrow-in-furness": [54.1108, -3.2261],
};

const ENRICH = {
  "A39 Bridgwater": () => load("ai/claude-enrich-a39.json"),
  "Cumbrian Coast": () => ({ is_relevant: true, relevance_reason: "Track renewal and sea defence works with site crews over 20 months.", project_type: "rail", site_location_text: "Site compound at Harrington, Workington", site_postcode: "CA14 5QD", site_town: "Workington", location_confidence: "high", est_workers_min: 40, est_workers_max: 70, est_workers_away_from_home: 45, duration_months: 20, start_date: "2027-01-11" }),
  "Lowestoft Water": () => text("ai/claude-enrich-invented-postcode.json"),
  "Sellafield Site": () => ({ is_relevant: true, relevance_reason: "Call-off civils framework with continuous on-site teams at Sellafield.", project_type: "nuclear", site_location_text: "Sellafield site, Seascale", site_postcode: "CA20 1PG", site_town: "Seascale", location_confidence: "high", est_workers_min: 60, est_workers_max: 120, est_workers_away_from_home: 70, duration_months: 48, start_date: "2026-10-05" }),
  "Sizewell C Two": () => ({ is_relevant: true, relevance_reason: "Two-year highway drainage and maintenance package on the A12 bypass.", project_type: "road", site_location_text: "Two Village Bypass (A12), near Farnham", site_postcode: null, site_town: "Saxmundham", location_confidence: "medium", est_workers_min: 8, est_workers_max: 15, est_workers_away_from_home: 8, duration_months: 24, start_date: null }),
  "Barrow-in-Furness Dock": () => ({ is_relevant: true, relevance_reason: "Quay wall strengthening and utility diversions over three years.", project_type: "defence", site_location_text: "Barrow-in-Furness docks", site_postcode: null, site_town: "Barrow-in-Furness", location_confidence: "medium", est_workers_min: 50, est_workers_max: 90, est_workers_away_from_home: 55, duration_months: 36, start_date: "2026-12-01" }),
  "Hinkley Point C Marine": () => ({ is_relevant: true, relevance_reason: "Marine works support at Hinkley Point C with site crews for about 21 months.", project_type: "nuclear", site_location_text: "Hinkley Point C, near Stogursey", site_postcode: "TA5 1UD", site_town: "Stogursey", location_confidence: "high", est_workers_min: 70, est_workers_max: 110, est_workers_away_from_home: 60, duration_months: 21, start_date: "2026-10-01" }),
};

function claudeReply(body) {
  const system = typeof body.system === "string" ? body.system : JSON.stringify(body.system);
  const user = String(body.messages?.[0]?.content ?? "");
  const hasSearch = (body.tools ?? []).some((t) => String(t.type).startsWith("web_search"));
  if (hasSearch) return load("ai/claude-web-search-message.json");
  let out;
  if (system.includes("contract award notices")) {
    const key = Object.keys(ENRICH).find((k) => user.includes(`Title: ${k}`));
    out = key ? ENRICH[key]() : { is_relevant: false, relevance_reason: "Not physical site works.", project_type: "other", site_location_text: null, site_postcode: null, site_town: null, location_confidence: "low", est_workers_min: null, est_workers_max: null, est_workers_away_from_home: null, duration_months: null, start_date: null };
  } else if (system.includes("short B2B outreach")) {
    const d = JSON.parse(user);
    const stock = d.our_houses_within_radius
      ? `we have ${d.our_houses_within_radius} whole house${d.our_houses_within_radius === 1 ? "" : "s"} within ${d.radius_miles} miles of the site, the nearest ${d.nearest_house_miles} miles away, from £${d.from_price_pppn_gbp} per person per night with bills included`
      : "we can source whole houses near the site for your crew, with bills included";
    out = {
      outreach_subject: `Crew houses near ${d.site_town ?? "your site"}`,
      outreach_body: `Hi {first_name},\n\nCongratulations on ${d.project}. If you have crews travelling to ${d.site_town ?? "the site"}, ${stock}.\n\nWhole houses keep a crew together, with Wi-Fi, council tax and cleaning covered. We quote the same day.\n\nReply to this email or call 0800 088 4225.\n\nReply 'no thanks' and we won't contact you again`,
      linkedin_message: `Congratulations on ${d.project}. We rent whole houses to contractor crews, bills included. Happy to send a same-day quote.`.slice(0, 300),
      call_script: ["Congratulate them on the award.", "Ask when crews mobilise and how many travel.", "Explain our nearby houses.", "Bills, Wi-Fi, council tax and cleaning included.", "Offer a same-day quote."],
    };
  } else if (system.includes("location landing pages")) {
    out = load("ai/claude-location-page.json");
  } else if (system.includes("project accommodation guides")) {
    out = load("ai/claude-project-page.json");
  } else if (system.includes("strict editor")) {
    out = load("ai/claude-review.json");
  } else if (system.includes("practical blog posts")) {
    out = load("ai/claude-blog-post.json");
  } else if (system.includes("plan blog content")) {
    out = load("ai/claude-topics.json");
  } else if (system.includes("portrays the named brand")) {
    out = { sentiment: "positive" };
  } else {
    out = { error: "mock: unrecognised prompt" };
  }
  const t = typeof out === "string" ? out : JSON.stringify(out);
  return { id: "msg_mock", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: t }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: Math.ceil(user.length / 4), output_tokens: Math.ceil(t.length / 4), server_tool_use: null } };
}

function route(host, path, query, body) {
  if (host === "www.contractsfinder.service.gov.uk") {
    const cursor = query.get("cursor");
    if (!cursor) return load("contracts-finder-search.json");
    if (cursor === "MTAw") {
      const p2 = load("contracts-finder-search-page2.json");
      p2.links = { next: "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?stages=award&limit=100&cursor=e2e3" };
      return p2;
    }
    return load("e2e/contracts-finder-page3.json");
  }
  if (host === "www.find-tender.service.gov.uk") return load("find-a-tender-packages.json");
  if (host === "api.postcodes.io") {
    let m = path.match(/^\/postcodes\/(.+)$/);
    if (m) {
      const pc = decodeURIComponent(m[1]).toUpperCase();
      const hit = POSTCODES[pc];
      return hit ? { status: 200, result: { postcode: pc, latitude: hit[0], longitude: hit[1], admin_district: hit[2] } } : [404, { status: 404, error: "Postcode not found" }];
    }
    m = path.match(/^\/outcodes\/(.+)$/);
    if (m) return [404, { status: 404, error: "Outcode not found" }];
    if (path === "/places") {
      const q = (query.get("q") ?? "").toLowerCase();
      const hit = PLACES[q];
      return { status: 200, result: hit ? [{ name_1: query.get("q"), latitude: hit[0], longitude: hit[1] }] : [] };
    }
  }
  if (host === "api.company-information.service.gov.uk") {
    const q = (query.get("q") ?? "").toLowerCase();
    return { items: q.includes("barhale") ? [{ company_number: "02345678", title: "BARHALE LIMITED", company_status: "active", address_snippet: "Walsall WS9 8UH" }] : [] };
  }
  if (host === "api.anthropic.com" && path === "/v1/messages") return claudeReply(body);
  if (host === "api.openai.com" && path === "/v1/responses") return load("ai/openai-response.json");
  if (host === "api.perplexity.ai") return load("ai/perplexity-response.json");
  if (host === "staysdirect.co.uk" && path === "/sitemap-blog.xml") {
    return ["xml", '<?xml version="1.0"?><urlset><url><loc>https://staysdirect.co.uk/blog/contractor-accommodation-guide</loc></url><url><loc>https://staysdirect.co.uk/blog/how-to-house-a-construction-crew-of-6-a-practical-guide</loc></url></urlset>'];
  }
  return [404, { error: `mock: no route for ${host}${path}` }];
}

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://mock");
    if (url.pathname === "/__log") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(log));
    }
    const [, host, ...rest] = url.pathname.split("/");
    const path = "/" + rest.join("/");
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {}
    let out = route(host, path, url.searchParams, body);
    let status = 200;
    let type = "application/json";
    if (Array.isArray(out)) {
      if (out[0] === "xml") [type, out] = ["application/xml", out[1]];
      else [status, out] = out;
    }
    log.push({ host, path: path + url.search, status });
    res.writeHead(status, { "content-type": type });
    res.end(typeof out === "string" ? out : JSON.stringify(out));
  });
}).listen(PORT, "0.0.0.0", () => console.log(`mock APIs on :${PORT}`));
