// JudgeTips — a small companion contract we deployed (see
// contracts/JudgeTips.sol) alongside the canonical ERC-8183 contract. Lets a
// completed job's client or provider tip the judge who evaluated it, in
// Arc's native currency — which IS USDC, since Arc uses USDC as its native
// gas token. The contract forwards the tip immediately; it never holds
// funds. Gated by the canonical contract's own state: only tippable once the
// job has actually reached Completed.
export const TIPS_ADDRESS = "0xE0359C02Ab0d500C3496c2E5D080676d022E9eFa" as const;

export const tipsAbi = [
  {
    type: "function",
    name: "tipJudge",
    stateMutability: "payable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "totalTipsReceived",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tipCount",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
