// Creates a fresh job with a $20 budget, pays the 1% platform fee, confirms
// the judge received exactly $0.20 and the contract's on-chain fee quote
// (feeFor) matches what we computed off-chain.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { decodeEventLog, formatEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  makeClients,
  log,
  writeAndWait,
  jobCreatedEvent,
  ERC8183_ADDRESS,
  erc8183Abi,
} from "../agents/lib.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const { abi } = JSON.parse(readFileSync(path.join(dir, "JudgeFee.json"), "utf8"));
const FEE_ADDRESS = process.argv[2];
if (!FEE_ADDRESS) throw new Error("usage: smoke-test-fee.mjs <JudgeFee address>");

const client = makeClients(process.env.CLIENT_PK);
const providerPk = process.env.PROVIDER_PK;
const provider = makeClients(providerPk);
const evaluatorAddr = privateKeyToAccount(process.env.EVALUATOR_PK).address;

// 1. Create job, assign provider
const expiredAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
const receipt = await writeAndWait(client.pub, client.wallet, {
  address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "createJob",
  args: [provider.account.address, evaluatorAddr, expiredAt, "$20 fee smoke test", "0x0000000000000000000000000000000000000000"],
});
let jobId;
for (const l of receipt.logs) {
  try { jobId = decodeEventLog({ abi: [jobCreatedEvent], ...l }).args.jobId; break; } catch {}
}
log("smoke", `created job #${jobId}`);

// 2. Provider sets a $20 budget
await writeAndWait(provider.pub, provider.wallet, {
  address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "setBudget",
  args: [jobId, parseUnits("20", 6), "0x"],
});
log("smoke", "provider set budget to 20 USDC");

// 3. Read the on-chain fee quote
const required = await client.pub.readContract({ address: FEE_ADDRESS, abi, functionName: "feeFor", args: [jobId] });
log("smoke", `feeFor(#${jobId}) = ${formatEther(required)} USDC (expect 0.2)`);
if (required !== parseUnits("0.2", 18)) {
  log("smoke", "FAIL — fee quote mismatch");
  process.exit(1);
}

// 4. Client pays the fee
const balBefore = await client.pub.getBalance({ address: evaluatorAddr });
await writeAndWait(client.pub, client.wallet, {
  address: FEE_ADDRESS, abi, functionName: "payFee", args: [jobId], value: required,
});
const balAfter = await client.pub.getBalance({ address: evaluatorAddr });
const delta = balAfter - balBefore;
log("smoke", `judge balance delta: ${formatEther(delta)} USDC`);

const paid = await client.pub.readContract({ address: FEE_ADDRESS, abi, functionName: "feePaid", args: [jobId] });
if (delta === required && paid === true) {
  log("smoke", "PASS — $20 job correctly charged $0.20 (1%) fee to judge");
} else {
  log("smoke", "FAIL");
  process.exit(1);
}

// 5. Duplicate payment should revert
try {
  await writeAndWait(client.pub, client.wallet, {
    address: FEE_ADDRESS, abi, functionName: "payFee", args: [jobId], value: required,
  });
  log("smoke", "FAIL — duplicate fee payment should have reverted");
  process.exit(1);
} catch {
  log("smoke", "PASS — duplicate fee payment correctly reverted");
}

// 6. Wrong amount should revert
try {
  const jobId2Receipt = await writeAndWait(client.pub, client.wallet, {
    address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "createJob",
    args: [provider.account.address, evaluatorAddr, expiredAt, "wrong-amount test", "0x0000000000000000000000000000000000000000"],
  });
  let jobId2;
  for (const l of jobId2Receipt.logs) {
    try { jobId2 = decodeEventLog({ abi: [jobCreatedEvent], ...l }).args.jobId; break; } catch {}
  }
  await writeAndWait(provider.pub, provider.wallet, {
    address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "setBudget", args: [jobId2, parseUnits("20", 6), "0x"],
  });
  await writeAndWait(client.pub, client.wallet, {
    address: FEE_ADDRESS, abi, functionName: "payFee", args: [jobId2], value: parseUnits("0.1", 18),
  });
  log("smoke", "FAIL — wrong fee amount should have reverted");
  process.exit(1);
} catch {
  log("smoke", "PASS — wrong fee amount correctly reverted");
}
