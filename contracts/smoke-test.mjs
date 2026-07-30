// One-off smoke test: create an open job with no provider pinned, then apply
// to it from a different wallet, confirm the applicant list reflects it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { decodeEventLog, zeroAddress } from "viem";
import { makeClients, log, writeAndWait, jobCreatedEvent, ERC8183_ADDRESS, erc8183Abi } from "../agents/lib.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const { abi: appsAbi } = JSON.parse(readFileSync(path.join(dir, "JobApplications.json"), "utf8"));
const APPLICATIONS_ADDRESS = process.argv[2];
if (!APPLICATIONS_ADDRESS) throw new Error("usage: smoke-test.mjs <JobApplications address>");

const client = makeClients(process.env.CLIENT_PK);
const evaluatorAddr = process.env.EVALUATOR_PK
  ? (await import("viem/accounts")).privateKeyToAccount(process.env.EVALUATOR_PK).address
  : client.account.address;

// 1. Create an open job with NO provider pinned
const expiredAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
const receipt = await writeAndWait(client.pub, client.wallet, {
  address: ERC8183_ADDRESS,
  abi: erc8183Abi,
  functionName: "createJob",
  args: [zeroAddress, evaluatorAddr, expiredAt, "JobApplications smoke test — open bounty", zeroAddress],
});
let jobId;
for (const l of receipt.logs) {
  try {
    jobId = decodeEventLog({ abi: [jobCreatedEvent], ...l }).args.jobId;
    break;
  } catch {}
}
log("smoke", `created open job #${jobId} (provider unset)`);

// 2. Apply from the provider wallet (a genuinely different address than client)
const applicant = makeClients(process.env.PROVIDER_PK);
await writeAndWait(applicant.pub, applicant.wallet, {
  address: APPLICATIONS_ADDRESS,
  abi: appsAbi,
  functionName: "applyToJob",
  args: [jobId],
});
log("smoke", `${applicant.account.address} applied to job #${jobId}`);

// 3. Read back the applicant list
const applicants = await client.pub.readContract({
  address: APPLICATIONS_ADDRESS,
  abi: appsAbi,
  functionName: "getApplicants",
  args: [jobId],
});
log("smoke", `applicants for #${jobId}: ${JSON.stringify(applicants)}`);
if (applicants.length === 1 && applicants[0].toLowerCase() === applicant.account.address.toLowerCase()) {
  log("smoke", "PASS — applicant recorded correctly");
} else {
  log("smoke", "FAIL — unexpected applicant list");
  process.exit(1);
}

// 4. Client assigns the applicant as provider via the EXISTING ERC-8183 flow
await writeAndWait(client.pub, client.wallet, {
  address: ERC8183_ADDRESS,
  abi: erc8183Abi,
  functionName: "setProvider",
  args: [jobId, applicant.account.address],
});
const job = await client.pub.readContract({ address: ERC8183_ADDRESS, abi: erc8183Abi, functionName: "getJob", args: [jobId] });
log("smoke", `job #${jobId} provider now: ${job.provider} — ${job.provider.toLowerCase() === applicant.account.address.toLowerCase() ? "PASS" : "FAIL"}`);
