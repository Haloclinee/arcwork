// Rates the judge on job #159512 (already Completed, evaluator = arcwork-judge)
// from both the client and provider wallets, then reads back the aggregate.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { makeClients, log, writeAndWait } from "../agents/lib.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const { abi } = JSON.parse(readFileSync(path.join(dir, "JudgeRatings.json"), "utf8"));
const RATINGS_ADDRESS = process.argv[2];
if (!RATINGS_ADDRESS) throw new Error("usage: smoke-test-ratings.mjs <JudgeRatings address> [jobId]");
const jobId = BigInt(process.argv[3] ?? "159512");

const client = makeClients(process.env.CLIENT_PK);
const provider = makeClients(process.env.PROVIDER_PK);
const judgeAddr = "0x253f06Aa19Ff7957A262C6AD77C177E0E0B7c945"; // arcwork-judge

// Client rates 5, provider rates 4
await writeAndWait(client.pub, client.wallet, {
  address: RATINGS_ADDRESS, abi, functionName: "rateJudge", args: [jobId, 5],
});
log("smoke", `client rated job #${jobId} judge: 5 stars`);

await writeAndWait(provider.pub, provider.wallet, {
  address: RATINGS_ADDRESS, abi, functionName: "rateJudge", args: [jobId, 4],
});
log("smoke", `provider rated job #${jobId} judge: 4 stars`);

const [count, sum] = await client.pub.readContract({
  address: RATINGS_ADDRESS, abi, functionName: "judgeStats", args: [judgeAddr],
});
log("smoke", `arcwork-judge aggregate: count=${count} sum=${sum} avg=${Number(sum) / Number(count)}`);
if (count === 2n && sum === 9n) {
  log("smoke", "PASS");
} else {
  log("smoke", "FAIL — unexpected aggregate");
  process.exit(1);
}

// Duplicate rate should revert
try {
  await writeAndWait(client.pub, client.wallet, {
    address: RATINGS_ADDRESS, abi, functionName: "rateJudge", args: [jobId, 3],
  });
  log("smoke", "FAIL — duplicate rating should have reverted");
  process.exit(1);
} catch {
  log("smoke", "PASS — duplicate rating correctly reverted");
}
