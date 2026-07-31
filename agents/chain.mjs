// Plain-.mjs duplicate of the chain/contract constants agents (and the
// Vercel serverless function in api/) need from src/lib/arc.ts + events.ts.
//
// Why duplicated instead of imported from the .ts source: locally, Node 24's
// native TS type-stripping lets agents/*.mjs `import ... from "../src/lib/
// arc.ts"` directly and it just works. Vercel's Node.js Function runtime
// does not do that stripping for a plain .mjs entrypoint — api/evaluate.mjs
// crashed in production with ERR_MODULE_NOT_FOUND trying to resolve the
// literal .ts path. Keeping a small, dependency-free .mjs copy here is the
// simplest fix that works in both places. Keep this in sync with
// src/lib/arc.ts / src/lib/events.ts if the contract or ABI changes.
import { defineChain } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.drpc.testnet.arc.network",
        "https://rpc.testnet.arc.network",
        "https://rpc.blockdaemon.testnet.arc.network",
      ],
      webSocket: ["wss://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

export const ERC8183_ADDRESS = "0x0747EEf0706327138c69792bF28Cd525089e4583";
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

export const erc8183Abi = [
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "setProvider",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "provider_", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setBudget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "deliverable", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "complete",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reject",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRefund",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "client", type: "address" },
          { name: "provider", type: "address" },
          { name: "evaluator", type: "address" },
          { name: "description", type: "string" },
          { name: "budget", type: "uint256" },
          { name: "expiredAt", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "submittedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "jobCounter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "paymentToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "platformFeeBP",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "evaluatorFeeBP",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

export const jobCreatedEvent = {
  type: "event",
  name: "JobCreated",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "client", type: "address", indexed: true },
    { name: "provider", type: "address", indexed: true },
    { name: "evaluator", type: "address", indexed: false },
    { name: "expiredAt", type: "uint256", indexed: false },
    { name: "hook", type: "address", indexed: false },
  ],
};

export const jobSubmittedEvent = {
  type: "event",
  name: "JobSubmitted",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "provider", type: "address", indexed: true },
    { name: "deliverable", type: "bytes32", indexed: false },
  ],
};

// JobApplications — lets any wallet signal interest in an open, unassigned
// job; the client still assigns via the canonical contract's setProvider().
export const APPLICATIONS_ADDRESS = "0xC360CFD9B9F44930aDF9da7830C67958864B1eA2";

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
];

// JudgeFee — mandatory 1% platform fee, client pays the judge once the job
// completes (payFee reverts otherwise).
export const FEE_ADDRESS = "0x7E691a8b5F4Fb1a4FF4647337b851378B637585E";

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
];

// JudgeTips — voluntary tip to the judge, only once a job has completed.
export const TIPS_ADDRESS = "0xE0359C02Ab0d500C3496c2E5D080676d022E9eFa";

export const tipsAbi = [
  {
    type: "function",
    name: "tipJudge",
    stateMutability: "payable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
];
