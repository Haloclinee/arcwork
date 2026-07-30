// Verifies the new timing: fee only payable once a job is Completed, and
// impossible to collect on a Rejected job. Client self-evaluates both test
// jobs (private test jobs, not real arcwork traffic) so we can directly
// drive complete()/reject() without waiting on a live judge agent.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { decodeEventLog, formatEther, parseUnits, stringToHex } from "viem";
import {
  makeClients, log, writeAndWait, jobCreatedEvent, ERC8183_ADDRESS, erc8183Abi,
} from "../agents/lib.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const { abi } = JSON.parse(readFileSync(path.join(dir, "JudgeFee.json"), "utf8"));
const FEE_ADDRESS = process.argv[2];
if (!FEE_ADDRESS) throw new Error("usage: smoke-test-fee2.mjs <JudgeFee address>");

const client = makeClients(process.env.CLIENT_PK);
const provider = makeClients(process.env.PROVIDER_PK);

async function createFundedJob(desc) {
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const receipt = await writeAndWait(client.pub, client.wallet, {
    address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "createJob",
    args: [provider.account.address, client.account.address, expiredAt, desc, "0x0000000000000000000000000000000000000000"],
  });
  let jobId;
  for (const l of receipt.logs) {
    try { jobId = decodeEventLog({ abi: [jobCreatedEvent], ...l }).args.jobId; break; } catch {}
  }
  await writeAndWait(provider.pub, provider.wallet, {
    address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "setBudget",
    args: [jobId, parseUnits("1", 6), "0x"],
  });
  const allowance = await client.pub.readContract({
    address: "0x3600000000000000000000000000000000000000",
    abi: [{ type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] }],
    functionName: "allowance", args: [client.account.address, ERC8183_ADDRESS],
  });
  if (allowance < parseUnits("1", 6)) {
    await writeAndWait(client.pub, client.wallet, {
      address: "0x3600000000000000000000000000000000000000",
      abi: [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "approve", args: [ERC8183_ADDRESS, parseUnits("1", 6)],
    });
  }
  await writeAndWait(client.pub, client.wallet, {
    address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "fund", args: [jobId, "0x"],
  });
  await writeAndWait(provider.pub, provider.wallet, {
    address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "submit",
    args: [jobId, "0x" + "11".repeat(32), "0x"],
  });
  return jobId;
}

// ── Path 1: success — Completed, fee should succeed ──
const jobA = await createFundedJob("fee-timing smoke test A (will complete)");
await writeAndWait(client.pub, client.wallet, {
  address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "complete",
  args: [jobA, stringToHex("ok", { size: 32 }), "0x"],
});
log("smoke", `job #${jobA} Completed`);

const required = await client.pub.readContract({ address: FEE_ADDRESS, abi, functionName: "feeFor", args: [jobA] });
await writeAndWait(client.pub, client.wallet, {
  address: FEE_ADDRESS, abi, functionName: "payFee", args: [jobA], value: required,
});
log("smoke", `paid fee (${formatEther(required)} USDC) on Completed job #${jobA} — PASS`);

// ── Path 2: failure — Rejected, fee must revert ──
const jobB = await createFundedJob("fee-timing smoke test B (will reject)");
await writeAndWait(client.pub, client.wallet, {
  address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "reject",
  args: [jobB, stringToHex("not good enough", { size: 32 }), "0x"],
});
log("smoke", `job #${jobB} Rejected`);

const requiredB = await client.pub.readContract({ address: FEE_ADDRESS, abi, functionName: "feeFor", args: [jobB] });
try {
  await writeAndWait(client.pub, client.wallet, {
    address: FEE_ADDRESS, abi, functionName: "payFee", args: [jobB], value: requiredB,
  });
  log("smoke", "FAIL — fee payment on a Rejected job should have reverted");
  process.exit(1);
} catch {
  log("smoke", `payFee on Rejected job #${jobB} correctly reverted — PASS`);
}

log("smoke", "ALL PASS — fee only collectible after a job actually succeeds");
