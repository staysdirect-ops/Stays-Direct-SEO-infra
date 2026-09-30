import { OPT_OUT_LINE } from "./facts.ts";
import { asString } from "./json.ts";
import { formatGbp, truncate, wordCount } from "./text.ts";
import type { CompanyFacts } from "./types.ts";

export interface MatchedPropertySummary {
  town: string;
  bedrooms: number;
  max_guests: number;
  pppn_from: number;
  van_parking: boolean;
  distance_miles: number;
  available_from: string | null;
}

export interface OutreachInput {
  project_title: string;
  site_town: string | null;
  supplier_name: string | null;
  start_date: string | null;
  est_workers_away_from_home: number | null;
  radius_miles: number;
  matches: MatchedPropertySummary[];
  facts: CompanyFacts;
  brand_voice: string;
}

export interface OutreachDraft {
  outreach_subject: string;
  outreach_body: string;
  linkedin_message: string;
  call_script: string;
  flags: string[];
}

export function outreachFacts(input: OutreachInput) {
  const nearest = input.matches.reduce<MatchedPropertySummary | null>(
    (best, m) => (!best || m.distance_miles < best.distance_miles ? m : best),
    null
  );
  const fromPppn = input.matches.length ? Math.min(...input.matches.map((m) => m.pppn_from)) : null;
  const beds = input.matches.reduce((s, m) => s + m.bedrooms, 0);
  return {
    houses_within_radius: input.matches.length,
    radius_miles: input.radius_miles,
    nearest_miles: nearest?.distance_miles ?? null,
    nearest_town: nearest?.town ?? null,
    from_pppn: fromPppn,
    total_bedrooms: beds,
    any_van_parking: input.matches.some((m) => m.van_parking),
  };
}

export function buildOutreachSystem(brandVoice: string, facts: CompanyFacts): string {
  return `You write short B2B outreach for ${facts.name} (${facts.website}), which rents whole houses (${facts.property_bedrooms_min}-${facts.property_bedrooms_max} beds, bills, Wi-Fi, council tax and cleaning included, priced per person per night) to contractor crews working away from home.

Brand voice: ${brandVoice}

Return ONLY a JSON object: {"outreach_subject": string, "outreach_body": string, "linkedin_message": string, "call_script": [5 strings]}

outreach_body rules:
- Plain text, at most 120 words, no greeting placeholder brackets other than "Hi {first_name},".
- Name the project and the town.
- State how many of our houses are within the radius and the nearest distance, the "from" pppn price, and that bills are included.
- Mention same-day quotes.
- One call to action: reply to this email or call ${facts.phone}.
- End with this exact line on its own: "${OPT_OUT_LINE}"
- Use ONLY the numbers and facts supplied. Never claim availability, dates or prices not in the data. If there are no houses nearby, say we can source houses near the site instead and do not state counts or distances.
linkedin_message: at most 300 characters, no links.
call_script: exactly 5 short bullet points for a phone call.`;
}

export function buildOutreachPrompt(input: OutreachInput): string {
  const f = outreachFacts(input);
  return JSON.stringify(
    {
      project: input.project_title,
      site_town: input.site_town,
      awarded_to: input.supplier_name,
      start_date: input.start_date,
      estimated_workers_away_from_home: input.est_workers_away_from_home,
      our_houses_within_radius: f.houses_within_radius,
      radius_miles: f.radius_miles,
      nearest_house_miles: f.nearest_miles,
      nearest_house_town: f.nearest_town,
      from_price_pppn_gbp: f.from_pppn,
      van_parking_available: f.any_van_parking,
      houses: input.matches.map((m) => ({
        town: m.town,
        bedrooms: m.bedrooms,
        sleeps: m.max_guests,
        from_pppn_gbp: m.pppn_from,
        van_parking: m.van_parking,
        miles_from_site: m.distance_miles,
      })),
    },
    null,
    2
  );
}

export function validateOutreach(raw: unknown, input: OutreachInput): OutreachDraft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const flags: string[] = [];
  const subject = truncate(
    asString(o.outreach_subject, 200) ?? `Crew accommodation for ${input.project_title}`,
    90
  );
  let body = (asString(o.outreach_body, 4000) ?? "").replace(/\r\n/g, "\n");
  body = body.replace(new RegExp(`\\n*${escapeRegExp(OPT_OUT_LINE)}\\.?\\s*$`), "").trimEnd();
  if (!body.includes(input.facts.phone)) flags.push("draft_missing_phone");
  body = `${body}\n\n${OPT_OUT_LINE}`;
  if (wordCount(body) > 130) flags.push("draft_over_120_words");
  const linkedin = truncate(asString(o.linkedin_message, 1000) ?? "", 300);
  const script = Array.isArray(o.call_script)
    ? o.call_script
        .map((s) => asString(s, 300))
        .filter((s): s is string => !!s)
        .slice(0, 5)
    : (asString(o.call_script, 2000) ?? "")
        .split(/\n+/)
        .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 5);
  if (script.length < 5) flags.push("call_script_incomplete");
  const allowed = allowedOutreachNumbers(input);
  const stray = numbersIn(`${subject} ${body} ${linkedin}`).filter((n) => !allowed.has(n));
  if (stray.length) flags.push("draft_unverified_numbers");
  return {
    outreach_subject: subject,
    outreach_body: body,
    linkedin_message: linkedin,
    call_script: script.map((s) => `- ${s}`).join("\n"),
    flags,
  };
}

function allowedOutreachNumbers(input: OutreachInput): Set<number> {
  const f = outreachFacts(input);
  const nums = [
    f.houses_within_radius,
    f.radius_miles,
    f.nearest_miles,
    f.from_pppn,
    f.total_bedrooms,
    input.est_workers_away_from_home,
    120,
    ...input.matches.flatMap((m) => [m.bedrooms, m.max_guests, m.pppn_from, m.distance_miles]),
    ...(input.facts.phone.match(/\d+/g) ?? []).map(Number),
    24,
    7,
    input.facts.property_bedrooms_min,
    input.facts.property_bedrooms_max,
    input.facts.credit_terms_days_min,
    input.facts.credit_terms_days_max,
    ...(input.start_date?.split("-").map(Number) ?? []),
    ...numbersIn(`${input.project_title} ${input.site_town ?? ""} ${input.supplier_name ?? ""}`),
  ];
  const out = new Set<number>();
  for (const n of nums)
    if (typeof n === "number") {
      out.add(n);
      out.add(Math.round(n));
    }
  return out;
}

function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((s) => Number(s.replace(/,/g, "")));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Deterministic draft used when AI is unavailable (spend cap, refusal); flagged for human rewrite. */
export function templateOutreach(input: OutreachInput): OutreachDraft {
  const f = outreachFacts(input);
  const where = input.site_town ?? "the site";
  const stock =
    f.houses_within_radius && f.nearest_miles != null && f.from_pppn != null
      ? `We have ${f.houses_within_radius} house${f.houses_within_radius === 1 ? "" : "s"} within ${f.radius_miles} miles of ${where}, the nearest ${f.nearest_miles} miles away, from ${formatGbp(f.from_pppn)} per person per night with bills included.`
      : `We can source whole houses near ${where} for your crew, with bills included.`;
  const body = [
    "Hi {first_name},",
    "",
    `I saw ${input.supplier_name ?? "your team"} won ${input.project_title}. If you have crews travelling to ${where}, ${stock}`,
    "",
    `Whole houses keep a crew together, with Wi-Fi, council tax and cleaning covered. We quote the same day.`,
    "",
    `Reply to this email or call ${input.facts.phone}.`,
    "",
    OPT_OUT_LINE,
  ].join("\n");
  return {
    outreach_subject: truncate(`Crew houses near ${where} for ${input.project_title}`, 90),
    outreach_body: body,
    linkedin_message: truncate(
      `Congrats on ${input.project_title}. We rent whole houses to contractor crews near ${where}, bills included, same-day quotes. Happy to help if you have people travelling.`,
      300
    ),
    call_script: [
      `Congratulate them on winning ${input.project_title}.`,
      `Ask when crews mobilise to ${where} and how many will travel.`,
      f.houses_within_radius
        ? `Explain we have ${f.houses_within_radius} houses within ${f.radius_miles} miles.`
        : "Explain we can source houses near the site.",
      "Bills, Wi-Fi, council tax and cleaning included; weekly or monthly terms.",
      `Offer a same-day quote; confirm email for details.`,
    ]
      .map((s) => `- ${s}`)
      .join("\n"),
    flags: ["draft_from_template"],
  };
}
