import { describe, expect, it, vi } from "vitest";
import { findCompany } from "../src/companies-house.ts";
import {
  extractPostcodes,
  geocode,
  haversineMiles,
  normalizePostcode,
  outcodeOf,
} from "../src/geo.ts";
import { createRateLimiter, fetchWithRetry } from "../src/http.ts";
import { fixture, jsonResponse, noSleep } from "./helpers.ts";

describe("postcodes", () => {
  it("normalises spacing and case and rejects junk", () => {
    expect(normalizePostcode("ta52ld")).toBe("TA5 2LD");
    expect(normalizePostcode("SW1A 1AA")).toBe("SW1A 1AA");
    expect(normalizePostcode("EC1A1BB")).toBe("EC1A 1BB");
    expect(normalizePostcode("not a postcode")).toBeNull();
    expect(normalizePostcode("12345")).toBeNull();
  });

  it("extracts postcodes from free text", () => {
    expect(extractPostcodes("Site compound at Harrington CA14 5QD, office LS1 1UR.")).toEqual([
      "CA14 5QD",
      "LS1 1UR",
    ]);
  });

  it("derives outcodes", () => {
    expect(outcodeOf("TA5 2LD")).toBe("TA5");
    expect(outcodeOf("ta5")).toBe("TA5");
  });

  it("computes distances in miles", () => {
    const leeds = { lat: 53.7997, lng: -1.5492 };
    const york = { lat: 53.959, lng: -1.0815 };
    expect(haversineMiles(leeds, york)).toBeCloseTo(21.6, 0);
  });
});

describe("geocode fallback", () => {
  function routes(map: Record<string, Response>) {
    return vi.fn(async (url: string) => {
      const key = Object.keys(map).find((k) => url.includes(k));
      return key ? map[key]!.clone() : jsonResponse(fixture("postcodes-io/not-found.json"), 404);
    });
  }

  it("uses the full postcode first", async () => {
    const fetchImpl = routes({
      "/postcodes/TA5%202LD": jsonResponse(fixture("postcodes-io/postcode-TA5-2LD.json")),
    });
    const r = await geocode({ postcode: "TA5 2LD", town: "Cannington" }, { fetchImpl });
    expect(r).toMatchObject({ method: "postcode", lat: 51.149687, lng: -3.064713 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to the outcode when the postcode is terminated", async () => {
    const fetchImpl = routes({
      "/outcodes/TA5": jsonResponse(fixture("postcodes-io/outcode-TA5.json")),
    });
    const r = await geocode({ postcode: "TA5 9ZZ", town: "Cannington" }, { fetchImpl });
    expect(r).toMatchObject({ method: "outcode", matched: "TA5" });
  });

  it("falls back to the town when there is no postcode", async () => {
    const fetchImpl = routes({
      "/places?q=Lowestoft": jsonResponse(fixture("postcodes-io/places-lowestoft.json")),
    });
    const r = await geocode({ postcode: null, town: "Lowestoft" }, { fetchImpl });
    expect(r).toMatchObject({ method: "town", matched: "Lowestoft", lat: 52.47559 });
  });

  it("returns null when nothing resolves", async () => {
    const fetchImpl = routes({ "/places": jsonResponse({ status: 200, result: [] }) });
    expect(await geocode({ postcode: "ZZ1 1ZZ", town: "Nowhere" }, { fetchImpl })).toBeNull();
  });
});

describe("fetchWithRetry", () => {
  it("retries 429 and 5xx with backoff, honouring Retry-After", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("slow down", { status: 429, headers: { "retry-after": "3" } })
      )
      .mockResolvedValueOnce(new Response("oops", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { fetchImpl, sleep: async (ms) => void sleeps.push(ms) }
    );
    expect(res.status).toBe(200);
    expect(sleeps).toEqual([3000, 2000]);
  });

  it("stops after the configured retries and returns the last response", async () => {
    const fetchImpl = vi.fn(async () => new Response("down", { status: 500 }));
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { fetchImpl, retries: 5, sleep: noSleep }
    );
    expect(res.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("does not retry 4xx client errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 400 }));
    await fetchWithRetry("https://example.test", {}, { fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("spaces calls with the rate limiter", async () => {
    let now = 0;
    const waits: number[] = [];
    const throttle = createRateLimiter(
      1000,
      () => now,
      async (ms) => {
        waits.push(ms);
        now += ms;
      }
    );
    await Promise.all([throttle(), throttle(), throttle()]);
    expect(waits).toEqual([1000, 1000]);
  });
});

describe("Companies House lookup", () => {
  it("returns the single active exact match, using basic auth", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({
        items: [
          {
            company_number: "01234567",
            title: "KIER HIGHWAYS LIMITED",
            company_status: "active",
            address_snippet: "Salford M50 3XP",
          },
          {
            company_number: "07654321",
            title: "KIER HIGHWAYS SERVICES LIMITED",
            company_status: "active",
          },
          { company_number: "00000001", title: "KIER HIGHWAYS LTD", company_status: "dissolved" },
        ],
      })
    );
    const r = await findCompany("key", "Kier Highways Ltd", fetchImpl);
    expect(r).toEqual({
      company_number: "01234567",
      title: "KIER HIGHWAYS LIMITED",
      address: "Salford M50 3XP",
      status: "active",
    });
    expect((fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBe(
      `Basic ${btoa("key:")}`
    );
  });

  it("returns null when the name is ambiguous or missing", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          { company_number: "1", title: "ACME LTD", company_status: "active" },
          { company_number: "2", title: "ACME LIMITED", company_status: "active" },
        ],
      })
    );
    expect(await findCompany("key", "Acme", fetchImpl)).toBeNull();
    expect(await findCompany("key", "   ", fetchImpl)).toBeNull();
  });
});

describe("bulk postcode lookup", () => {
  it("returns coordinates and a locality, skipping unknown and invalid postcodes", async () => {
    const { bulkLookupPostcodes } = await import("../src/geo.ts");
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const { postcodes } = JSON.parse(init!.body as string) as { postcodes: string[] };
      expect(postcodes).toEqual(["TA5 2LD", "LS1 1UR", "TA5 9ZZ"]);
      return jsonResponse({
        status: 200,
        result: [
          {
            query: "TA5 2LD",
            result: {
              postcode: "TA5 2LD",
              latitude: 51.15,
              longitude: -3.06,
              parish: "Cannington",
              admin_ward: "Cannington",
              admin_district: "Somerset",
            },
          },
          {
            query: "LS1 1UR",
            result: {
              postcode: "LS1 1UR",
              latitude: 53.8,
              longitude: -1.55,
              parish: "Leeds, unparished area",
              admin_ward: "Little London & Woodhouse",
              admin_district: "Leeds",
            },
          },
          { query: "TA5 9ZZ", result: null },
        ],
      });
    });
    const m = await bulkLookupPostcodes(["ta52ld", "LS1 1UR", "TA5 9ZZ", "nonsense"], {
      fetchImpl,
    });
    expect(m.get("TA5 2LD")).toEqual({
      postcode: "TA5 2LD",
      lat: 51.15,
      lng: -3.06,
      locality: "Cannington",
    });
    expect(m.get("LS1 1UR")?.locality).toBe("Leeds");
    expect(m.has("TA5 9ZZ")).toBe(false);
  });
});

describe("fetchWithRetry timeouts", () => {
  it("aborts a hung attempt and retries", async () => {
    let calls = 0;
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      calls++;
      if (calls === 1) {
        return new Promise<Response>((_, reject) =>
          init!.signal!.addEventListener("abort", () => reject(new Error("aborted")))
        );
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { fetchImpl, timeoutMs: 20, sleep: noSleep }
    );
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });
});
