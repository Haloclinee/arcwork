// One-off: rates the judge for every swarm job that reached a terminal,
// judged state (Completed or Rejected) but hasn't been rated yet — both the
// client and the provider of each job rate independently (JudgeRatings
// allows one rating per address per job). Completed jobs get 4-5 stars,
// Rejected jobs get 2-4 (the verdict can still have felt fair even when the
// outcome wasn't what the client wanted).
// Run:  node --env-file=agents/.env agents/rate-judges.mjs 160433 160434 ...
import { privateKeyToAccount } from "viem/accounts";
import { RATINGS_ADDRESS, ratingsAbi } from "../src/lib/ratings.ts";
import { getJob, log, makeClients, writeAndWait, JOB_STATUS } from "./lib.mjs";
import { CLIENT_PERSONAS, PROVIDER_SPECIALTIES, randInt } from "./swarm-data.mjs";

const jobIds = process.argv.slice(2).map(BigInt);
if (jobIds.length === 0) {
  console.error("usage: node agents/rate-judges.mjs <jobId> [jobId...]");
  process.exit(1);
}

// address -> { pk, label }
const wallets = new Map();
for (const [i, p] of CLIENT_PERSONAS.entries()) {
  const pk = process.env[`CLIENT_${i + 1}_PK`];
  if (pk) wallets.set(privateKeyToAccount(pk).address.toLowerCase(), { pk, label: `client:${p.key}` });
}
for (const [i, p] of PROVIDER_SPECIALTIES.entries()) {
  const pk = process.env[`PROVIDER_${i + 1}_PK`];
  if (pk) wallets.set(privateKeyToAccount(pk).address.toLowerCase(), { pk, label: `provider:${p.key}` });
}

const { pub } = makeClients(process.env.CLIENT_PK);

for (const jobId of jobIds) {
  const job = await getJob(pub, jobId);
  const status = JOB_STATUS[job.status];
  if (status !== "Completed" && status !== "Rejected") {
    log("rate", `job #${jobId}: status is ${status}, not judged yet — skipping`);
    continue;
  }
  const stars = status === "Completed" ? randInt(4, 5) : randInt(2, 4);

  for (const addr of [job.client, job.provider]) {
    const w = wallets.get(addr.toLowerCase());
    if (!w) {
      log("rate", `job #${jobId}: no known wallet for ${addr} — skipping that side`);
      continue;
    }
    const { account, pub: p, wallet } = makeClients(w.pk);
    const already = await p.readContract({
      address: RATINGS_ADDRESS,
      abi: ratingsAbi,
      functionName: "hasRated",
      args: [jobId, account.address],
    });
    if (already) {
      log("rate", `job #${jobId}: ${w.label} already rated — skipping`);
      continue;
    }
    await writeAndWait(p, wallet, {
      address: RATINGS_ADDRESS,
      abi: ratingsAbi,
      functionName: "rateJudge",
      args: [jobId, stars],
    });
    log("rate", `job #${jobId}: ${w.label} rated the judge ${stars}★`);
  }
}
