/**
 * corrAL-edu Intent Classifier
 * Local regex-based classifier — no external AI calls.
 * Categories: debugging, brainstorming, explaining, summarizing, other
 */

const INTENT_PATTERNS = [
  ['debugging', /(\berror\b|\bbug\b|\bfix\b|doesn't work|exception|\btraceback\b|\bissue\b|\bproblem\b|\bwrong\b|\bbroken\b|\bfail\b|typeerror|undefined|null is not|\bundefined\b)/i],
  ['explaining', /(\bunderstand\b|\bwhat is\b|\bhow does\b|\bexplain\b|\bclarify\b|\bdefinition\b|\btell me about\b|\bdescribe\b|\bmeaning\b|\bconcept\b)/i],
  ['brainstorming', /(\bidea\b|\bthink about\b|\bexplore\b|\bpossibilities\b|\boptions\b|\bapproach\b|\bdifferent ways\b|\bways to\b|\bcould we\b|\bwhat if\b|\bhow about\b)/i],
  ['summarizing', /(summarize|tl;?dr|recap|wrap up|key points|bottom line|summary|in short|overall)/i],
];

export function classifyIntent(promptText) {
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(promptText)) return intent;
  }
  return 'other';
}

/**
 * Sanitize prompt for safe logging — returns only length.
 * CRITICAL: We never log actual prompt text, only metrics.
 */
export function extractMetrics(promptText) {
  return {
    promptLength: promptText.length,
    wordCount: promptText.trim().split(/\s+/).length,
  };
}