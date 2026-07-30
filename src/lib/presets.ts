// Curated, known-good evaluator agents that clients can pick without typing
// an address. Each is a neutral third party (agents/evaluator.mjs / judges.mjs)
// — none of them are the client or the provider, and each judges with its own
// locally-run model, so no two verdicts come from the same reasoning. Names
// are registered on-chain via ANS (see agents/register-judges.mjs), so they
// also resolve to "<ansName>.arc" anywhere an ANS-aware app looks them up.
//
// Keep this in sync with agents/judges.mjs (address comes from that wallet).
// agentId is each judge's ERC-8004 identity on Arc's IdentityRegistry — see
// src/lib/erc8004.ts and agents/register-erc8004.mjs (one-time registration,
// already run for all four judges).
export interface EvaluatorPreset {
  address: `0x${string}`;
  ansName: string;
  description: string;
  agentId: bigint;
}

export const EVALUATOR_PRESETS: EvaluatorPreset[] = [
  {
    address: "0x253f06Aa19Ff7957A262C6AD77C177E0E0B7c945",
    ansName: "arcwork-judge",
    description:
      "General-purpose verdicts, balanced between speed and care. The default choice for most jobs.",
    agentId: 851875n,
  },
  {
    address: "0xF464DB9c5d6D1661911Ca534bC72B017765A46ed",
    ansName: "arcwork-sage",
    description:
      "Reasons through its verdict step by step before deciding. Slower, more deliberate — suited to jobs with nuanced acceptance criteria.",
    agentId: 851876n,
  },
  {
    address: "0xf53f265F1790924ba354c0E35895132E5D8FC6Aa",
    ansName: "arcwork-swift",
    description:
      "A lightweight model tuned for fast, low-latency verdicts. Good fit for small, clearly-scoped jobs.",
    agentId: 851877n,
  },
  {
    address: "0x119f97069DdA681FA00Cb66965A311714456013e",
    ansName: "arcwork-hermes",
    description:
      "Weighs the job's stated acceptance criteria literally rather than judging on overall impression.",
    agentId: 851878n,
  },
];
