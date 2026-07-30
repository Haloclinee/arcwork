// Autonomous PROVIDER agent: watches for jobs assigned to it, prices them,
// does the work with Claude once funded, and submits the deliverable on-chain
// with the content embedded in calldata.
//
// Run:  node --env-file=agents/.env agents/provider.mjs
import { parseUnits } from "viem";
import {
  ERC8183_ADDRESS,
  erc8183Abi,
  JOB_STATUS,
  aiDoWork,
  aiPriceJob,
  encodeDeliverable,
  getJob,
  jobCreatedEvent,
  log,
  makeClients,
  sleep,
  writeAndWait,
} from "./lib.mjs";

const { account, pub, wallet } = makeClients(process.env.PROVIDER_PK);
log("provider", `agent online as ${account.address}`);

const seen = new Set(); // jobIds we've already priced
const working = new Set(); // jobIds we've already submitted for

async function findAssignedJobs() {
  const latest = await pub.getBlockNumber();
  const logs = await pub.getLogs({
    address: ERC8183_ADDRESS,
    event: jobCreatedEvent,
    args: { provider: account.address },
    fromBlock: latest > 9500n ? latest - 9500n : 1n,
    toBlock: latest,
  });
  return logs.map((l) => l.args.jobId).filter((id) => id !== undefined);
}

async function handleJob(jobId) {
  const job = await getJob(pub, jobId);
  const status = JOB_STATUS[job.status];
  const expired = BigInt(Math.floor(Date.now() / 1000)) >= job.expiredAt;
  if (expired && status !== "Funded") return;

  if (status === "Open" && job.budget === 0n && !seen.has(jobId.toString())) {
    seen.add(jobId.toString());
    log("provider", `job #${jobId}: "${job.description.slice(0, 60)}" — pricing…`);
    const price = await aiPriceJob(job.description);
    await writeAndWait(pub, wallet, {
      address: ERC8183_ADDRESS,
      abi: erc8183Abi,
      functionName: "setBudget",
      args: [jobId, parseUnits(price, 6), "0x"],
    });
    log("provider", `job #${jobId}: budget set to ${price} USDC — waiting for funding`);
  }

  if (status === "Funded" && !working.has(jobId.toString())) {
    working.add(jobId.toString());
    log("provider", `job #${jobId}: funded! working on the deliverable…`);
    const content = await aiDoWork(job.description);
    const { deliverable, optParams } = encodeDeliverable(content);
    await writeAndWait(pub, wallet, {
      address: ERC8183_ADDRESS,
      abi: erc8183Abi,
      functionName: "submit",
      args: [jobId, deliverable, optParams],
    });
    log("provider", `job #${jobId}: submitted on-chain (${content.length} chars embedded)`);
    log("provider", `job #${jobId}: deliverable preview: ${content.slice(0, 100).replace(/\n/g, " ")}…`);
  }

  if (status === "Completed") {
    log("provider", `job #${jobId}: COMPLETED — payment received ✓`);
  }
}

while (true) {
  try {
    const ids = await findAssignedJobs();
    for (const id of ids) await handleJob(id);
  } catch (e) {
    log("provider", `error: ${String(e.shortMessage ?? e.message ?? e).slice(0, 120)}`);
  }
  await sleep(8000);
}
