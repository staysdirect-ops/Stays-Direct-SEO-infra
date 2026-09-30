import { extractPostcodes, normalizePostcode } from "./geo.ts";
import { normalizeForKey } from "./text.ts";
import type { RadarSource } from "./types.ts";

// Minimal OCDS 1.1 shapes. Real payloads carry many more fields; everything is optional.
export interface OcdsValue {
  amount?: number | null;
  amountGross?: number | null;
  currency?: string | null;
}
export interface OcdsPeriod {
  startDate?: string | null;
  endDate?: string | null;
  durationInDays?: number | null;
}
export interface OcdsAddress {
  streetAddress?: string | null;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryName?: string | null;
}
export interface OcdsClassification {
  scheme?: string | null;
  id?: string | null;
  description?: string | null;
}
export interface OcdsIdentifier {
  scheme?: string | null;
  id?: string | number | null;
  legalName?: string | null;
}
export interface OcdsParty {
  id?: string | null;
  name?: string | null;
  roles?: string[] | null;
  address?: OcdsAddress | null;
  identifier?: OcdsIdentifier | null;
  additionalIdentifiers?: OcdsIdentifier[] | null;
}
export interface OcdsOrgRef {
  id?: string | null;
  name?: string | null;
}
export interface OcdsItem {
  id?: string | null;
  description?: string | null;
  classification?: OcdsClassification | null;
  additionalClassifications?: OcdsClassification[] | null;
  deliveryAddresses?: OcdsAddress[] | null;
  deliveryAddress?: OcdsAddress | null;
  deliveryLocation?: { description?: string | null } | null;
  deliveryLocations?: Array<{ description?: string | null }> | null;
}
export interface OcdsDocument {
  documentType?: string | null;
  url?: string | null;
}
export interface OcdsAward {
  id?: string | null;
  relatedLots?: string[] | null;
  documents?: OcdsDocument[] | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  date?: string | null;
  value?: OcdsValue | null;
  suppliers?: OcdsOrgRef[] | null;
  contractPeriod?: OcdsPeriod | null;
  items?: OcdsItem[] | null;
}
export interface OcdsContract {
  id?: string | null;
  awardID?: string | null;
  status?: string | null;
  value?: OcdsValue | null;
  period?: OcdsPeriod | null;
  dateSigned?: string | null;
}
export interface OcdsRelease {
  ocid: string;
  id: string;
  /** Find a Tender puts free-text "additional information" here. */
  description?: string | null;
  date?: string | null;
  tag?: string[] | null;
  buyer?: OcdsOrgRef | null;
  parties?: OcdsParty[] | null;
  tender?: {
    id?: string | null;
    title?: string | null;
    description?: string | null;
    value?: OcdsValue | null;
    classification?: OcdsClassification | null;
    items?: OcdsItem[] | null;
    contractPeriod?: OcdsPeriod | null;
    lots?: Array<{ id?: string; title?: string | null; description?: string | null }> | null;
    documents?: OcdsDocument[] | null;
  } | null;
  awards?: OcdsAward[] | null;
  contracts?: OcdsContract[] | null;
}
export interface OcdsReleasePackage {
  releases?: OcdsRelease[] | null;
  links?: { next?: string | null } | null;
}

/** Row shape for radar_projects (subset set at ingest time). */
export interface IngestedProject {
  source: RadarSource;
  source_id: string;
  ocid: string;
  source_url: string;
  title: string;
  description: string | null;
  buyer_name: string | null;
  buyer_postcode: string | null;
  supplier_name: string | null;
  supplier_companies_house_number: string | null;
  supplier_address: string | null;
  cpv_codes: string[];
  value_gbp: number | null;
  award_date: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_months: number | null;
  delivery_text: string | null;
  delivery_postcodes: string[];
  dedupe_key: string;
  raw: OcdsRelease;
}

const AWARD_TAGS = ["award", "awardUpdate", "contract", "contractUpdate"];
const LIVE_AWARD_STATUSES = ["active", "pending", null, undefined, ""];

/** FTS is queried without `stages` (it would drop Procurement Act 2023 notices), so filter here. */
export function isAwardRelease(r: OcdsRelease): boolean {
  const tagged = (r.tag ?? []).some((t) => AWARD_TAGS.includes(t));
  const liveAward = (r.awards ?? []).some(
    (a) => LIVE_AWARD_STATUSES.includes(a.status ?? null) && (a.suppliers?.length ?? 0) > 0
  );
  return liveAward && (tagged || (r.contracts?.length ?? 0) > 0 || (r.awards?.length ?? 0) > 0);
}

function gbp(v: OcdsValue | null | undefined): number | null {
  if (!v) return null;
  if (v.currency && v.currency.toUpperCase() !== "GBP") return null;
  const n = v.amount ?? v.amountGross;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function isoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function monthsBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24 * 30.44)));
}

function formatAddress(a: OcdsAddress | null | undefined): string | null {
  if (!a) return null;
  const parts = [a.streetAddress, a.locality, a.region, a.postalCode].filter(
    (p): p is string => !!p?.trim()
  );
  return parts.length ? parts.join(", ") : null;
}

function companiesHouseNumber(p: OcdsParty | undefined): string | null {
  if (!p) return null;
  const ids = [p.identifier, ...(p.additionalIdentifiers ?? [])].filter(
    Boolean
  ) as OcdsIdentifier[];
  for (const id of ids) {
    const scheme = (id.scheme ?? "").toUpperCase();
    const raw = String(id.id ?? "")
      .toUpperCase()
      .replace(/\s/g, "");
    if (
      (scheme === "GB-COH" || scheme === "GB-CH") &&
      /^([A-Z]{2}\d{6}|\d{8}|\d{6,7})$/.test(raw)
    ) {
      return /^\d{6,7}$/.test(raw) ? raw.padStart(8, "0") : raw;
    }
  }
  return null;
}

function cpvCodes(r: OcdsRelease): string[] {
  const out = new Set<string>();
  const add = (c: OcdsClassification | null | undefined) => {
    if (!c?.id) return;
    if (c.scheme && c.scheme.toUpperCase() !== "CPV") return;
    const code = String(c.id)
      .replace(/[^0-9]/g, "")
      .slice(0, 8);
    if (code.length >= 2) out.add(code);
  };
  add(r.tender?.classification);
  const items = [...(r.tender?.items ?? []), ...(r.awards ?? []).flatMap((a) => a.items ?? [])];
  for (const it of items) {
    add(it.classification);
    for (const ac of it.additionalClassifications ?? []) add(ac);
  }
  return [...out];
}

// NUTS 2016 / ITL 2021 level-1 regions. Find a Tender gives delivery places as codes only
// (e.g. "UKC11", "TLD3"); we name the level-1 region and keep the code, never guess finer names.
const UK_REGIONS: Record<string, string> = {
  C: "North East England",
  D: "North West England",
  E: "Yorkshire and the Humber",
  F: "East Midlands",
  G: "West Midlands",
  H: "East of England",
  I: "London",
  J: "South East England",
  K: "South West England",
  L: "Wales",
  M: "Scotland",
  N: "Northern Ireland",
};

/** "UKD33" → "UKD33 (North West England)"; "UK" → "United Kingdom (nationwide)". Other text unchanged. */
export function describeRegion(region: string | null | undefined): string | null {
  const r = region?.trim();
  if (!r) return null;
  const code = r.toUpperCase();
  if (code === "UK" || code === "GB") return "United Kingdom (nationwide)";
  const m = code.match(/^(?:UK|TL)([C-N])[0-9A-Z]{0,3}$/);
  if (!m) return r;
  const name = UK_REGIONS[m[1]!];
  if (!name) return r;
  return code.length <= 3 ? name : `${code} (${name})`;
}

function deliveryInfo(r: OcdsRelease): { text: string | null; postcodes: string[] } {
  const items = [...(r.tender?.items ?? []), ...(r.awards ?? []).flatMap((a) => a.items ?? [])];
  const texts = new Set<string>();
  const postcodes = new Set<string>();
  for (const it of items) {
    const addrs = [
      ...(it.deliveryAddresses ?? []),
      ...(it.deliveryAddress ? [it.deliveryAddress] : []),
    ];
    for (const a of addrs) {
      const t = formatAddress({ ...a, region: describeRegion(a.region) });
      if (t) texts.add(t);
      const pc = normalizePostcode(a.postalCode);
      if (pc) postcodes.add(pc);
    }
    for (const loc of [
      ...(it.deliveryLocations ?? []),
      ...(it.deliveryLocation ? [it.deliveryLocation] : []),
    ]) {
      if (loc.description?.trim()) texts.add(loc.description.trim());
    }
  }
  for (const t of texts) for (const pc of extractPostcodes(t)) postcodes.add(pc);
  return { text: texts.size ? [...texts].join("; ") : null, postcodes: [...postcodes] };
}

const NOTICE_HOSTS: Record<RadarSource, string> = {
  contracts_finder: "https://www.contractsfinder.service.gov.uk/Notice/",
  find_a_tender: "https://www.find-tender.service.gov.uk/Notice/",
};

export function sourceUrl(source: RadarSource, r: OcdsRelease): string {
  // Prefer the notice link the source publishes itself (award notice first).
  const docs = [
    ...(r.awards ?? []).flatMap((a) => a.documents ?? []),
    ...(r.tender?.documents ?? []),
  ];
  const official = (d: OcdsDocument) => !!d.url?.startsWith(NOTICE_HOSTS[source]);
  const doc =
    docs.find((d) => d.documentType === "awardNotice" && official(d)) ??
    docs.find((d) => official(d) && !d.url!.includes("/Attachment/"));
  if (doc?.url) return doc.url;
  if (source === "find_a_tender") {
    const noticeId = r.id.match(/\d{6}-\d{4}/)?.[0] ?? r.id;
    return `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(noticeId)}`;
  }
  // Contracts Finder release ids are "<notice guid>-<number>"; the ocid holds a different guid.
  const guid =
    r.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ??
    r.ocid.replace(/^ocds-[a-z0-9]+-/i, "");
  return `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(guid)}`;
}

export function dedupeKey(title: string, supplier: string | null, value: number | null): string {
  const v = value ? String(Math.round(value / 1000)) : "na";
  return `${normalizeForKey(title)}|${normalizeForKey(supplier)}|${v}`;
}

/**
 * Find a Tender award titles are often just the lot ("Lot 1: Mechanical Services"), which is
 * meaningless on its own, so combine with the tender title when they differ.
 */
export function projectTitle(
  tenderTitle: string | null | undefined,
  award: Pick<OcdsAward, "title" | "relatedLots">,
  lots?: Array<{ id?: string; title?: string | null }> | null
): string {
  // Contracts Finder buyers often suffix award notices with "- AWARD".
  const clean = (t: string | null | undefined) =>
    (t ?? "").replace(/\s*[-–:(]\s*(contract\s+)?award(ed)?\s*\)?\s*$/i, "").trim();
  const tender = clean(tenderTitle);
  const lotTitle = award.relatedLots?.length
    ? lots?.find((l) => l.id === award.relatedLots![0])?.title?.trim()
    : undefined;
  const part = clean(award.title) || clean(lotTitle);
  if (!tender) return part;
  if (!part || normalizeForKey(tender).includes(normalizeForKey(part))) return tender;
  if (normalizeForKey(part).includes(normalizeForKey(tender))) return part;
  return `${tender}: ${part}`;
}

export function mapRelease(source: RadarSource, r: OcdsRelease): IngestedProject | null {
  if (!r?.ocid || !isAwardRelease(r)) return null;
  const award =
    (r.awards ?? []).find((a) => (a.status ?? "active") === "active" && a.suppliers?.length) ??
    (r.awards ?? []).find((a) => a.suppliers?.length);
  if (!award) return null;
  const parties = r.parties ?? [];
  const byId = (id: string | null | undefined) =>
    id ? parties.find((p) => p.id === id) : undefined;

  const buyerParty = byId(r.buyer?.id) ?? parties.find((p) => p.roles?.includes("buyer"));
  const supplierRef = award.suppliers?.[0];
  const supplierParty =
    byId(supplierRef?.id) ??
    parties.find((p) => p.roles?.includes("supplier") && p.name === supplierRef?.name);
  const contract = (r.contracts ?? []).find((c) => c.awardID === award.id) ?? r.contracts?.[0];

  const title = projectTitle(r.tender?.title, award, r.tender?.lots);
  if (!title) return null;
  const period = contract?.period ?? award.contractPeriod ?? r.tender?.contractPeriod ?? null;
  const start = isoDate(period?.startDate);
  const end = isoDate(period?.endDate);
  const duration =
    monthsBetween(start, end) ??
    (period?.durationInDays ? Math.max(1, Math.round(period.durationInDays / 30.44)) : null);
  const value = gbp(award.value) ?? gbp(contract?.value) ?? gbp(r.tender?.value);
  const supplierName = supplierRef?.name?.trim() || supplierParty?.name?.trim() || null;
  const delivery = deliveryInfo(r);
  const description = [r.tender?.description, award.description, r.description]
    .filter((d): d is string => !!d?.trim())
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .join("\n\n");

  return {
    source,
    source_id: `${source}:${r.ocid}`,
    ocid: r.ocid,
    source_url: sourceUrl(source, r),
    title,
    description: description || null,
    buyer_name: r.buyer?.name?.trim() || buyerParty?.name?.trim() || null,
    buyer_postcode: normalizePostcode(buyerParty?.address?.postalCode),
    supplier_name: supplierName,
    supplier_companies_house_number: companiesHouseNumber(supplierParty),
    supplier_address: formatAddress(supplierParty?.address),
    cpv_codes: cpvCodes(r),
    value_gbp: value,
    award_date: isoDate(award.date) ?? isoDate(contract?.dateSigned) ?? isoDate(r.date),
    start_date: start,
    end_date: end,
    duration_months: duration,
    delivery_text: delivery.text,
    delivery_postcodes: delivery.postcodes,
    dedupe_key: dedupeKey(title, supplierName, value),
    raw: r,
  };
}

export interface RelevanceFilter {
  minValueGbp: number;
  cpvPrefixes: string[];
}

export function passesFilter(
  p: Pick<IngestedProject, "cpv_codes" | "value_gbp">,
  f: RelevanceFilter
): boolean {
  const cpvOk = p.cpv_codes.some((code) => f.cpvPrefixes.some((prefix) => code.startsWith(prefix)));
  const valueOk = p.value_gbp === null || p.value_gbp >= f.minValueGbp;
  return cpvOk && valueOk;
}

export interface ExistingKeys {
  ocids: Set<string>;
  dedupeKeys: Set<string>;
  sourceIds: Set<string>;
}

/**
 * Drops releases already stored from another source (same ocid or same title+supplier+value)
 * and collapses duplicates within the batch, keeping the latest release per ocid.
 * Same-source rows pass through so updates upsert by source_id.
 */
export function dedupeProjects(
  projects: IngestedProject[],
  existing: ExistingKeys
): IngestedProject[] {
  const latestByOcid = new Map<string, IngestedProject>();
  for (const p of projects) {
    const prev = latestByOcid.get(p.ocid);
    if (!prev || (p.raw.date ?? "") >= (prev.raw.date ?? "")) latestByOcid.set(p.ocid, p);
  }
  const seenKeys = new Set<string>();
  const out: IngestedProject[] = [];
  for (const p of latestByOcid.values()) {
    const isUpdate = existing.sourceIds.has(p.source_id);
    if (!isUpdate && (existing.ocids.has(p.ocid) || existing.dedupeKeys.has(p.dedupe_key)))
      continue;
    if (seenKeys.has(p.dedupe_key)) continue;
    seenKeys.add(p.dedupe_key);
    out.push(p);
  }
  return out;
}

export function contractsFinderSearchUrl(fromIso: string, toIso: string, cursor?: string): string {
  const u = new URL("https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search");
  u.searchParams.set("publishedFrom", fromIso);
  u.searchParams.set("publishedTo", toIso);
  u.searchParams.set("stages", "award");
  u.searchParams.set("limit", "100");
  if (cursor) u.searchParams.set("cursor", cursor);
  return u.toString();
}

export function findATenderSearchUrl(fromIso: string, toIso: string, cursor?: string): string {
  const u = new URL("https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages");
  u.searchParams.set("updatedFrom", fromIso);
  u.searchParams.set("updatedTo", toIso);
  u.searchParams.set("limit", "100");
  if (cursor) u.searchParams.set("cursor", cursor);
  return u.toString();
}

/** Ingest window: since last successful run (minus 1h overlap), else 3 days; backfill overrides. */
export function ingestWindow(
  now: Date,
  lastSuccessAt: Date | null,
  backfillDays?: number | null
): { from: Date; to: Date } {
  const day = 24 * 60 * 60 * 1000;
  if (backfillDays && backfillDays > 0)
    return { from: new Date(now.getTime() - Math.min(backfillDays, 365) * day), to: now };
  if (lastSuccessAt) return { from: new Date(lastSuccessAt.getTime() - 60 * 60 * 1000), to: now };
  return { from: new Date(now.getTime() - 3 * day), to: now };
}

/** OCDS endpoints want second precision without milliseconds. */
export function ocdsDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "");
}
