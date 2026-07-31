// Shared complexity-based pricing heuristic — used independently by both
// sides (agents/provider-agent.mjs sets the real on-chain budget with it,
// agents/client-agent.mjs computes its own "expected" figure to sanity-check
// against). Deterministic on the description, with a random jitter per call
// so the two sides' estimates aren't always identical — occasionally land
// >20% apart, which is what actually exercises the client's reject path.
const COMPLEXITY_KEYWORDS = [
  "audit", "checklist", "test plan", "structured", "pipeline", "deployment",
];

function complexityScore(description) {
  const words = description.trim().split(/\s+/).length;
  let score = words / 12; // ~12 words ≈ 1 complexity point
  const lower = description.toLowerCase();
  for (const kw of COMPLEXITY_KEYWORDS) {
    if (lower.includes(kw)) score += 1.5;
  }
  return score;
}

// Returns a price string in USDC, e.g. "1.75". `discount` is a 0–1 fraction
// (GENERALIST's 10% below-specialist pricing); `jitter` adds independent
// per-call noise so client/provider estimates can genuinely diverge.
export function priceJob(description, { discount = 0, jitter = 0.15 } = {}) {
  const score = complexityScore(description);
  // Map complexity score to the 0.50–5.00 USDC band roughly matching the
  // spec's simple/moderate/complex tiers (score ~1 → 0.5, ~6+ → 5).
  let price = 0.5 + Math.min(score, 6) * 0.75;
  price *= 1 - discount;
  const noise = 1 + (Math.random() * 2 - 1) * jitter;
  price *= noise;
  price = Math.max(0.5, Math.min(5, price));
  return price.toFixed(2);
}
