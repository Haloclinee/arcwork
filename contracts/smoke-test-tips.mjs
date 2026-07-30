// Tips the judge on job #159512 (Completed, evaluator = arcwork-judge) from
// the client wallet, confirms the judge's balance moved and stats updated.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseEther, formatEther } from "viem";
import { makeClients, log, writeAndWait } from "../agents/lib.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const { abi } = JSON.parse(readFileSync(path.join(dir, "JudgeTips.json"), "utf8"));
const TIPS_ADDRESS = process.argv[2];
if (!TIPS_ADDRESS) throw new Error("usage: smoke-test-tips.mjs <JudgeTips address> [jobId]");
const jobId = BigInt(process.argv[3] ?? "159512");
const judgeAddr = "0x253f06Aa19Ff7957A262C6AD77C177E0E0B7c945"; // arcwork-judge

const client = makeClients(process.env.CLIENT_PK);
const tipAmount = parseEther("0.02");

const balBefore = await client.pub.getBalance({ address: judgeAddr });
log("smoke", `judge balance before: ${formatEther(balBefore)} USDC`);

await writeAndWait(client.pub, client.wallet, {
  address: TIPS_ADDRESS, abi, functionName: "tipJudge", args: [jobId], value: tipAmount,
});
log("smoke", `sent tip of ${formatEther(tipAmount)} USDC on job #${jobId}`);

const balAfter = await client.pub.getBalance({ address: judgeAddr });
log("smoke", `judge balance after: ${formatEther(balAfter)} USDC`);

const [totalTips, count] = await Promise.all([
  client.pub.readContract({ address: TIPS_ADDRESS, abi, functionName: "totalTipsReceived", args: [judgeAddr] }),
  client.pub.readContract({ address: TIPS_ADDRESS, abi, functionName: "tipCount", args: [judgeAddr] }),
]);
log("smoke", `contract stats: totalTipsReceived=${formatEther(totalTips)} USDC, tipCount=${count}`);

const delta = balAfter - balBefore;
if (delta === tipAmount && totalTips === tipAmount && count === 1n) {
  log("smoke", "PASS — tip forwarded and recorded correctly");
} else {
  log("smoke", `FAIL — delta=${formatEther(delta)}`);
  process.exit(1);
}

// Rejecting a tip on a non-Completed job should revert — sanity check with a bogus jobId won't
// work (job doesn't exist -> getJob reverts differently), so just confirm zero-value tips revert.
try {
  await writeAndWait(client.pub, client.wallet, {
    address: TIPS_ADDRESS, abi, functionName: "tipJudge", args: [jobId], value: 0n,
  });
  log("smoke", "FAIL — zero-value tip should have reverted");
  process.exit(1);
} catch {
  log("smoke", "PASS — zero-value tip correctly reverted");
}
