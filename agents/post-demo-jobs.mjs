// One-off: posts a handful of open, unassigned demo jobs (real client
// wallet, real judges, no auto-apply) for recording a walkthrough video —
// applying + chat need something genuinely open to interact with live.
// Run:  node --env-file=agents/.env agents/post-demo-jobs.mjs
import { zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ERC8183_ADDRESS, erc8183Abi, jobCreatedEvent } from "./chain.mjs";
import { log, makeClients, writeAndWait } from "./lib.mjs";
import { JUDGES } from "./judges.mjs";
import { decodeEventLog } from "viem";

const JUDGE_ADDRESSES = JUDGES.map((j) => process.env[j.pkEnv]).filter(Boolean).map((pk) => privateKeyToAccount(pk).address);

const DEMO_JOBS = [
  {
    desc: "Write a 300-word blog post explaining why USDC-as-gas-token simplifies UX for on-chain job marketplaces. Deliverable: the post as plain text, ready to publish. Acceptance: covers at least 3 concrete UX benefits, no filler.",
    days: 7,
  },
  {
    desc: "Write a Node.js function (viem) that takes an ERC-8183 jobId and returns its current status as a human-readable string. Deliverable: the function source plus a 2-line usage example. Acceptance: handles all 6 status values (Open/Funded/Submitted/Completed/Rejected/Expired).",
    days: 7,
  },
  {
    desc: "Design a 5-question user-research survey for people who'd hire an AI provider agent to do freelance work. Deliverable: the 5 questions, each with a one-line rationale for why it matters. Acceptance: questions are specific, not generic ('how was your experience?').",
    days: 5,
  },
  {
    desc: "Produce a markdown table comparing arcwork vs. Upwork vs. Fiverr across 6 dimensions (fee %, escrow model, dispute resolution, payout speed, who can be a provider, trust mechanism). Acceptance: every cell filled with a real, specific claim — no blanks.",
    days: 7,
  },
  {
    desc: "Write a bash one-liner that checks whether a given 0x address on Arc Testnet is a contract or an EOA, using curl + the public RPC. Deliverable: the command plus one sentence explaining how it works. Acceptance: actually runnable, not pseudocode.",
    days: 5,
  },
  {
    desc: "Write 3 example support-chat replies a job marketplace might send to a user who asks 'why hasn't my job been judged yet?' — one for <5min wait, one for 1hr wait, one for >24hr wait. Acceptance: each reply is under 40 words and actually answers the question.",
    days: 5,
  },
];

const { account, pub, wallet } = makeClients(process.env.CLIENT_PK);
log("demo", `posting ${DEMO_JOBS.length} open jobs from ${account.address}`);

for (let i = 0; i < DEMO_JOBS.length; i++) {
  const { desc, days } = DEMO_JOBS[i];
  const evaluator = JUDGE_ADDRESSES[i % JUDGE_ADDRESSES.length];
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
  const receipt = await writeAndWait(pub, wallet, {
    address: ERC8183_ADDRESS,
    abi: erc8183Abi,
    functionName: "createJob",
    args: [zeroAddress, evaluator, expiredAt, desc, zeroAddress],
  });
  let jobId;
  for (const l of receipt.logs) {
    try { jobId = decodeEventLog({ abi: [jobCreatedEvent], ...l }).args.jobId; break; } catch { /* skip */ }
  }
  log("demo", `job #${jobId} created — "${desc.slice(0, 60)}…" (expires in ${days}d)`);
}
