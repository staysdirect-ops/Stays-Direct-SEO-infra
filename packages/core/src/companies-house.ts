import { fetchWithRetry, type FetchLike } from "./http.ts";
import { normalizeForKey } from "./text.ts";

export interface CompanyMatch {
  company_number: string;
  title: string;
  address: string | null;
  status: string | null;
}

interface SearchResponse {
  items?: Array<{ company_number?: string; title?: string; address_snippet?: string; company_status?: string }>;
}

function basicAuth(key: string): string {
  return `Basic ${btoa(`${key}:`)}`;
}

/** Exact (normalised) name match only; ambiguous names return null rather than a guess. */
export async function findCompany(apiKey: string, name: string, fetchImpl?: FetchLike): Promise<CompanyMatch | null> {
  const want = normalizeForKey(name);
  if (!want) return null;
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(name)}&items_per_page=10`;
  const res = await fetchWithRetry(url, { headers: { authorization: basicAuth(apiKey) } }, { retries: 3, fetchImpl });
  if (!res.ok) return null;
  const body = (await res.json()) as SearchResponse;
  const matches = (body.items ?? []).filter((i) => i.company_number && normalizeForKey(i.title) === want);
  const active = matches.filter((m) => m.company_status === "active");
  const pick = active.length === 1 ? active[0] : matches.length === 1 ? matches[0] : undefined;
  if (!pick?.company_number) return null;
  return {
    company_number: pick.company_number,
    title: pick.title ?? name,
    address: pick.address_snippet ?? null,
    status: pick.company_status ?? null,
  };
}
