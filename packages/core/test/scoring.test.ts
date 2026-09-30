import { describe, expect, it } from "vitest";
import { NO_STOCK_SCORE_CAP, scoreOpportunity, startPoints, valuePoints } from "../src/scoring.ts";

const today = new Date("2026-09-30T00:00:00Z");
const base = {
  valueGbp: 20_000_000,
  workersAwayFromHome: 60,
  nearestPropertyMiles: 2,
  matchRadiusMiles: 25,
  startDate: "2026-10-15",
  locationConfidence: "high" as const,
  today,
};

describe("scoreOpportunity", () => {
  it("scores a large, close, imminent, well-located project highly", () => {
    const r = scoreOpportunity(base);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.flags).toEqual([]);
    expect(r.breakdown.start).toBe(15);
    expect(r.breakdown.confidence).toBe(10);
    expect(r.breakdown.workers).toBe(25);
  });

  it("stays within 0-100 and each component within its maximum", () => {
    const r = scoreOpportunity({
      ...base,
      valueGbp: 5_000_000_000,
      workersAwayFromHome: 900,
      nearestPropertyMiles: 0,
    });
    expect(r.score).toBe(100);
    expect(r.breakdown.value).toBe(25);
    expect(r.breakdown.distance).toBe(25);
  });

  it("caps at 40 and flags a sourcing opportunity when no stock is within the radius", () => {
    const none = scoreOpportunity({ ...base, nearestPropertyMiles: null });
    expect(none.score).toBe(NO_STOCK_SCORE_CAP);
    expect(none.flags).toContain("sourcing_opportunity");
    const far = scoreOpportunity({ ...base, nearestPropertyMiles: 40 });
    expect(far.score).toBeLessThanOrEqual(NO_STOCK_SCORE_CAP);
    expect(far.flags).toContain("sourcing_opportunity");
  });

  it("does not raise weak projects to the cap", () => {
    const r = scoreOpportunity({
      ...base,
      valueGbp: 600_000,
      workersAwayFromHome: 2,
      nearestPropertyMiles: null,
      startDate: "2027-06-01",
      locationConfidence: "low",
    });
    expect(r.score).toBeLessThan(NO_STOCK_SCORE_CAP);
    expect(r.flags).toEqual(expect.arrayContaining(["sourcing_opportunity", "location_uncertain"]));
  });

  it("gives distance points only inside the radius, more when closer", () => {
    const near = scoreOpportunity({ ...base, nearestPropertyMiles: 1 }).breakdown.distance;
    const edge = scoreOpportunity({ ...base, nearestPropertyMiles: 24 }).breakdown.distance;
    expect(near).toBeGreaterThan(edge);
    expect(edge).toBeGreaterThan(0);
  });

  it("flags unknown values but still scores them neutrally", () => {
    const r = scoreOpportunity({ ...base, valueGbp: null });
    expect(r.flags).toContain("value_unknown");
    expect(r.breakdown.value).toBe(8);
  });
});

describe("components", () => {
  it("value is log-scaled from £500k to £50m", () => {
    expect(valuePoints(500_000)).toBe(0);
    expect(valuePoints(5_000_000)).toBeCloseTo(12.5, 1);
    expect(valuePoints(50_000_000)).toBe(25);
  });

  it("start points taper from 30 to 90 days out", () => {
    expect(startPoints("2026-10-20", today)).toBe(15);
    expect(startPoints("2026-11-29", today)).toBeCloseTo(7.5, 1);
    expect(startPoints("2027-01-15", today)).toBe(0);
    expect(startPoints(null, today)).toBe(4);
  });
});
