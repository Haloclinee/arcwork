// JudgeRatings — a small, permissionless companion contract we deployed
// (see contracts/JudgeRatings.sol) alongside the canonical ERC-8183 contract.
// Lets a job's client OR provider — the two parties who actually experienced
// a judge's verdict — rate that judge 1-5 stars, once each, after the job
// reaches a judged terminal state (Completed or Rejected). No admin, no fees,
// no access to escrow.
export const RATINGS_ADDRESS = "0x573B49182706E53ffAd7e5cB886e8F7Cf9cbD098" as const;

export const ratingsAbi = [
  {
    type: "function",
    name: "rateJudge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "stars", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hasRated",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "judgeStats",
    stateMutability: "view",
    inputs: [{ name: "judge", type: "address" }],
    outputs: [
      { name: "count", type: "uint256" },
      { name: "sum", type: "uint256" },
    ],
  },
] as const;
