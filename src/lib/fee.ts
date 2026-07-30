// JudgeFee — a small companion contract we deployed (see
// contracts/JudgeFee.sol) alongside the canonical ERC-8183 contract. A
// mandatory 1% platform fee on a job's budget, paid by the client directly
// to the judge (evaluator) — but only once the job has actually reached
// Completed. If the judge rejects the work or the job expires, payFee()
// reverts: a judge can never collect a fee on a job that didn't pay out.
// Distinct from JudgeTips (voluntary) — clearly labeled "1% fee" in the UI
// so it's never confused with tipping. The contract never holds funds.
export const FEE_ADDRESS = "0x7E691a8b5F4Fb1a4FF4647337b851378B637585E" as const;

export const feeAbi = [
  {
    type: "function",
    name: "feeFor",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "payFee",
    stateMutability: "payable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "feePaid",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "totalFeesReceived",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
