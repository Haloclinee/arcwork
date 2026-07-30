// JobApplications — a small, permissionless companion contract we deployed
// (see contracts/JobApplications.sol) alongside the canonical ERC-8183
// contract. The canonical contract only lets a job's CLIENT call
// setProvider() (verified on-chain — a stranger's call reverts with
// Unauthorized), so this registry gives any wallet a way to signal interest
// in an open, unassigned job. The client reads applicants here and still
// assigns the provider via the canonical contract's own setProvider().
// Never touches escrow, payment, or job state — read-only with respect to
// ERC-8183, write-only with respect to itself.
export const APPLICATIONS_ADDRESS = "0xC360CFD9B9F44930aDF9da7830C67958864B1eA2" as const;

export const applicationsAbi = [
  {
    type: "function",
    name: "applyToJob",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getApplicants",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "hasApplied",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
