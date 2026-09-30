import { describe, it, expect } from "vitest";
import { scoreProject } from "./scoring";

describe("Project scoring", () => {
  it("scores a high-value project with nearby stock", () => {
    const result = scoreProject({
      valueGbp: 5000000,
      estimatedWorkersAwayFromHome: 100,
      nearestPropertyDistance: 5,
      startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      locationConfidence: "high",
      hasNearbyStock: true,
    });

    expect(result.score).toBeGreaterThan(80);
    expect(result.flags).not.toContain("sourcing_opportunity");
  });

  it("caps score at 40 for sourcing opportunities without nearby stock", () => {
    const result = scoreProject({
      valueGbp: 10000000,
      estimatedWorkersAwayFromHome: 200,
      nearestPropertyDistance: null,
      startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      locationConfidence: "high",
      hasNearbyStock: false,
    });

    expect(result.score).toBeLessThanOrEqual(40);
    expect(result.flags).toContain("sourcing_opportunity");
  });

  it("handles projects starting beyond 90 days", () => {
    const result = scoreProject({
      valueGbp: 500000,
      estimatedWorkersAwayFromHome: 20,
      nearestPropertyDistance: 50,
      startDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString(),
      locationConfidence: "low",
      hasNearbyStock: true,
    });

    expect(result.score).toBeLessThan(30);
  });
});
