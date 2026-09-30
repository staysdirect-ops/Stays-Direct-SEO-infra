export interface QualityCheckResult {
  score: number;
  issues: string[];
  passed: boolean;
}

const BANNED_PHRASES = [
  "nestled",
  "vibrant",
  "quaint",
  "charming",
  "picturesque",
  "discover",
  "experience",
  "unique opportunity",
  "unparalleled",
];

const WORD_COUNT_RANGES: Record<string, [number, number]> = {
  location: [700, 1200],
  project: [700, 1200],
  blog: [1200, 1800],
};

export function checkContentQuality(content: {
  type: "location" | "project" | "blog";
  title: string;
  body: string;
  dataPackNumbers: number[];
  faqCount: number;
}): QualityCheckResult {
  const issues: string[] = [];

  // Word count check
  const wordCount = content.body.split(/\s+/).length;
  const [minWords, maxWords] = WORD_COUNT_RANGES[content.type];
  if (wordCount < minWords || wordCount > maxWords) {
    issues.push(`Word count ${wordCount} outside range ${minWords}-${maxWords}`);
  }

  // Extract numbers from body
  const bodyNumbers = extractNumbers(content.body);
  const unmatchedNumbers = bodyNumbers.filter((num) => !content.dataPackNumbers.includes(num));
  if (unmatchedNumbers.length > 0) {
    issues.push(`Numbers in body not from data pack: ${unmatchedNumbers.join(", ")}`);
  }

  // Banned phrases check
  const foundBannedPhrases = BANNED_PHRASES.filter((phrase) => content.body.toLowerCase().includes(phrase));
  if (foundBannedPhrases.length > 0) {
    issues.push(`Contains banned phrases: ${foundBannedPhrases.join(", ")}`);
  }

  // FAQ count check
  if (content.faqCount < 6) {
    issues.push(`FAQ count ${content.faqCount} below minimum 6`);
  }

  // Title length check
  if (content.title.length > 60) {
    issues.push(`Title length ${content.title.length} exceeds 60 characters`);
  }

  const score = Math.max(0, 100 - issues.length * 15);

  return {
    score,
    issues,
    passed: score >= 70 && issues.length === 0,
  };
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+/g) || [];
  return Array.from(new Set(matches.map(Number)));
}
