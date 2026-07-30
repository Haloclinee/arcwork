// Autonomous CLIENT agent: posts a job for the provider agent, funds the escrow
// once priced, waits for the submission, then hands judgment to a THIRD-PARTY
// evaluator agent (agents/evaluator.mjs, judging locally via Ollama) — the
// client never grades its own purchase. One full agent-to-agent economic loop.
//
// Run:  node --env-file=agents/.env agents/client.mjs ["custom job description"]
import { formatUnits, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ERC8183_ADDRESS,
  USDC_ADDRESS,
  erc20Abi,
  erc8183Abi,
  JOB_STATUS,
  getJob,
  jobCreatedEvent,
  log,
  makeClients,
  recoverDeliverable,
  sleep,
  writeAndWait,
} from "./lib.mjs";

const { account, pub, wallet } = makeClients(process.env.CLIENT_PK);
const providerAddr = privateKeyToAccount(process.env.PROVIDER_PK).address;
const evaluatorAddr = privateKeyToAccount(process.env.EVALUATOR_PK).address;

const description =
  process.argv[2] ??
  "Write a 5-bullet launch checklist for a stablecoin-native job marketplace on Arc Testnet. Deliverable: the checklist as plain text.";

log("client", `agent online as ${account.address}`);
log("client", `posting job for provider ${providerAddr}`);
log("client", `evaluator is the independent local-LLM agent ${evaluatorAddr} — not me`);

// 1. Create the job. Evaluator is a THIRD party agent (agents/evaluator.mjs),
// not the client — so the client can't grade its own purchase.
const expiredAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
const createReceipt = await writeAndWait(pub, wallet, {
  address: ERC8183_ADDRESS,
  abi: erc8183Abi,
  functionName: "createJob",
  args: [providerAddr, evaluatorAddr, expiredAt, description, "0x0000000000000000000000000000000000000000"],
});
let jobId;
for (const l of createReceipt.logs) {
  try {
    jobId = decodeEventLog({ abi: [jobCreatedEvent], ...l }).args.jobId;
    break;
  } catch { /* not JobCreated */ }
}
const createdBlock = createReceipt.blockNumber;
log("client", `job #${jobId} created — "${description.slice(0, 70)}…"`);
log("client", `watch it live: http://localhost:5173/#/job/${jobId}`);

// 2. Wait for the provider to price it, then fund
let job;
while (true) {
  job = await getJob(pub, jobId);
  if (job.budget > 0n) break;
  await sleep(5000);
}
log("client", `provider priced the job at ${formatUnits(job.budget, 6)} USDC — funding escrow`);

const allowance = await pub.readContract({
  address: USDC_ADDRESS,
  abi: erc20Abi,
  functionName: "allowance",
  args: [account.address, ERC8183_ADDRESS],
});
if (allowance < job.budget) {
  await writeAndWait(pub, wallet, {
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [ERC8183_ADDRESS, job.budget],
  });
}
await writeAndWait(pub, wallet, {
  address: ERC8183_ADDRESS,
  abi: erc8183Abi,
  functionName: "fund",
  args: [jobId, "0x"],
});
log("client", `escrow funded (${formatUnits(job.budget, 6)} USDC locked)`);

// 3. Wait for submission
while (true) {
  job = await getJob(pub, jobId);
  if (JOB_STATUS[job.status] === "Submitted") break;
  await sleep(5000);
}
log("client", "work submitted — recovering deliverable from calldata…");

const recovered = await recoverDeliverable(pub, jobId, createdBlock);
const content = recovered?.content ?? "(content not embedded — hash only)";
log("client", `deliverable:\n---\n${content}\n---`);
log("client", "handing off to the independent evaluator agent — I have no say in the verdict");

// 4. Wait for the neutral evaluator (agents/evaluator.mjs) to judge it.
// The client does NOT evaluate its own purchase — that's the whole point.
while (true) {
  job = await getJob(pub, jobId);
  const status = JOB_STATUS[job.status];
  if (status === "Completed" || status === "Rejected") break;
  await sleep(5000);
}

log("client", `job #${jobId} final status: ${JOB_STATUS[job.status]}`);
if (JOB_STATUS[job.status] === "Completed") {
  log("client", `evaluator approved — ${formatUnits(job.budget, 6)} USDC released to provider agent ✓`);
} else {
  log("client", "evaluator rejected — escrow refunded to client ✓");
}
log("client", `full trace: http://localhost:5173/#/job/${jobId}`);
