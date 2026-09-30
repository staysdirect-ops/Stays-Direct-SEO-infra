import type { CompanyFacts } from "./types.ts";

export const DEFAULT_BRAND_VOICE =
  "Direct, practical, no fluff. Written for busy site and project managers. British English. Plain numbers, pppn pricing, bills included, same-day quotes, 24/7 UK support. Never hype. Never invent facts.";

export const DEFAULT_COMPANY_FACTS: CompanyFacts = {
  name: "StaysDirect",
  website: "https://staysdirect.co.uk",
  phone: "0800 088 4225",
  property_bedrooms_min: 4,
  property_bedrooms_max: 8,
  credit_terms_days_min: 14,
  credit_terms_days_max: 30,
  hotel_saving_pct_min: 30,
  hotel_saving_pct_max: 50,
  included: ["bills", "Wi-Fi", "council tax", "cleaning"],
  usps: [
    "Direct operator, no agency markup",
    "Same-day quotes",
    "24/7 UK support",
    "Weekly and monthly terms",
    "Credit terms available",
    "Priced per person per night (pppn)",
  ],
};

export const OPT_OUT_LINE = "Reply 'no thanks' and we won't contact you again";

export function mergeCompanyFacts(partial: Partial<CompanyFacts> | null | undefined): CompanyFacts {
  return { ...DEFAULT_COMPANY_FACTS, ...(partial ?? {}) };
}

/** Numbers that may appear in any generated copy because they are company facts, not local data. */
export function factNumbers(facts: CompanyFacts): number[] {
  const phoneParts = facts.phone.match(/\d+/g) ?? [];
  return [
    ...phoneParts.map(Number),
    24,
    7,
    facts.property_bedrooms_min,
    facts.property_bedrooms_max,
    facts.credit_terms_days_min,
    facts.credit_terms_days_max,
    facts.hotel_saving_pct_min,
    facts.hotel_saving_pct_max,
  ];
}
