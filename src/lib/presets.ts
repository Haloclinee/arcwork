// Curated, known-good evaluator agents that clients can pick without typing
// an address. Each is a neutral third party (agents/evaluator.mjs / judges.mjs)
// — none of them are the client or the provider, and each judges with its own
// model (OpenRouter, or a local Ollama fallback of the same name — see
// agents/lib.mjs), so no two verdicts come from the same reasoning. Names
// are registered on-chain via ANS (see agents/register-judges.mjs), so they
// also resolve to "<ansName>.arc" anywhere an ANS-aware app looks them up.
//
// Keep this in sync with agents/judges.mjs (address comes from that wallet).
// agentId is each judge's ERC-8004 identity on Arc's IdentityRegistry — see
// src/lib/erc8004.ts and agents/register-erc8004.mjs.
export interface EvaluatorPreset {
  address: `0x${string}`;
  ansName: string;
  description: string;
  agentId: bigint;
}

export const EVALUATOR_PRESETS: EvaluatorPreset[] = [
  // ── Original 4 — same wallets/agentIds as before, renamed to match their
  // new OpenRouter models (agents/judges.mjs: judge/sage/swift/hermes). ──
  {
    address: "0x253f06Aa19Ff7957A262C6AD77C177E0E0B7c945",
    ansName: "arcwork-llama",
    description:
      "General-purpose verdicts, balanced between speed and care. The default choice for most jobs.",
    agentId: 851875n,
  },
  {
    address: "0xF464DB9c5d6D1661911Ca534bC72B017765A46ed",
    ansName: "arcwork-deepseek",
    description:
      "Reasons through its verdict step by step before deciding. Slower, more deliberate — suited to jobs with nuanced acceptance criteria.",
    agentId: 851876n,
  },
  {
    address: "0xf53f265F1790924ba354c0E35895132E5D8FC6Aa",
    ansName: "arcwork-gemma",
    description:
      "A lightweight model tuned for fast, low-latency verdicts. Good fit for small, clearly-scoped jobs.",
    agentId: 851877n,
  },
  {
    address: "0x119f97069DdA681FA00Cb66965A311714456013e",
    ansName: "arcwork-mistral",
    description:
      "Weighs the job's stated acceptance criteria literally rather than judging on overall impression.",
    agentId: 851878n,
  },

  // ── New 8 (agents/judges.mjs: phi/qwen/nova/scout/solar/zeus/flash/yi) ──
  {
    address: "0x720ED06Ad2C160Ff3A1c047535d43F21BB706D5C",
    ansName: "arcwork-phi",
    description:
      "A small model that punches above its weight on reasoning. Good middle ground when you want careful judgment without the latency of a heavier model.",
    agentId: 853295n,
  },
  {
    address: "0x13Ec3ff69F8BdB6185fD53537cE6376F049Eb258",
    ansName: "arcwork-qwen",
    description:
      "Strong multilingual and technical comprehension — a solid fit for jobs with code, data, or non-English deliverables.",
    agentId: 853296n,
  },
  {
    address: "0xDb11e8ad4C3dBA006390901dA970C9D99CA4C11e",
    ansName: "arcwork-nova",
    description:
      "Reliable, consistent verdicts with few surprises. A dependable default when you'd rather not think about which judge to pick.",
    agentId: 853297n,
  },
  {
    address: "0x20de1bF0e3Bb6611a5eF9b57A5Be49518C3BFE39",
    ansName: "arcwork-scout",
    description:
      "Ultra-fast, minimal-latency verdicts on a small model. Best for simple, unambiguous jobs where speed matters more than nuance.",
    agentId: 853298n,
  },
  {
    address: "0xF8d6E081f8207A796dec654445e5e45aF7bf90ab",
    ansName: "arcwork-solar",
    description:
      "Tuned for tight instruction-following — judges strictly against what the job description actually asked for.",
    agentId: 853299n,
  },
  {
    address: "0x9EaC51EDC140cbEfBc70FE6002156E060ADD0B8b",
    ansName: "arcwork-zeus",
    description:
      "The heaviest reasoner in the roster — works through its verdict at length before deciding. Slowest judge here, best for jobs where getting it right matters more than getting it fast.",
    agentId: 853300n,
  },
  {
    address: "0xd7B037614539f7595641a1549D74fB5774e72199",
    ansName: "arcwork-flash",
    description:
      "Very fast and very cheap to run. Suited to high-volume, low-stakes jobs where you want a quick, no-frills verdict.",
    agentId: 853301n,
  },
  {
    address: "0x99BE9FC623E73Ed5eddCEB57484E9ae7048E5Fcc",
    ansName: "arcwork-yi",
    description:
      "Handles long, detailed deliverables well — a long context window and a thorough read before it renders a verdict.",
    agentId: 853302n,
  },
];
