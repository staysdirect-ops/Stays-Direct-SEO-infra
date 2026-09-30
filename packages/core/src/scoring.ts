export interface ScoringInput {
  valueGbp: number | null;
  estimatedWorkersAwayFromHome: number;
  nearestPropertyDistance: number | null;
  startDate: string | null;
  locationConfidence: "high" | "medium" | "low";
  hasNearbyStock: boolean;
}

export interface ScoringResult {
  score: number;
  flags: string[];
}

export function scoreProject(input: ScoringInput): ScoringResult {
  const flags: string[] = [];
  let score = 0;

  // Value: up to 25 points
  if (input.valueGbp) {
    const valueScore = Math.min(25, (input.valueGbp / 1000000) * 25);
    score += valueScore;
  }

  // Workers away from home: up to 25 points
  const workerScore = Math.min(25, (input.estimatedWorkersAwayFromHome / 100) * 25);
  score += workerScore;

  // Nearest property distance: up to 25 points
  if (input.nearestPropertyDistance !== null) {
    const distanceScore = Math.max(0, 25 - (input.nearestPropertyDistance / 50) * 25);
    score += distanceScore;
  } else if (!input.hasNearbyStock) {
    flags.push("sourcing_opportunity");
  }

  // Start date: up to 15 points
  if (input.startDate) {
    const daysUntilStart = Math.floor((new Date(input.startDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilStart >= 0 && daysUntilStart <= 90) {
      const daysScore = 15 * (1 - daysUntilStart / 90);
      score += daysScore;
    }
  }

  // Location confidence: up to 10 points
  const confidenceMap = { high: 10, medium: 5, low: 2 };
  score += confidenceMap[input.locationConfidence];

  // Cap score at 40 if sourcing opportunity (no nearby stock)
  if (flags.includes("sourcing_opportunity")) {
    score = Math.min(40, score);
  }

  return {
    score: Math.round(score),
    flags,
  };
}
