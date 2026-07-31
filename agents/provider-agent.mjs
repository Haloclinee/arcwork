// Runs all 5 PROVIDER_SPECIALTIES (agents/swarm-data.mjs) concurrently, each
// its own wallet (PROVIDER_1_PK..PROVIDER_5_PK). Scans jobs posted by the
// known client-agent swarm (agents/client-agent.mjs) for open, unassigned
// work matching its specialty, applies via the JobApplications companion
// contract, prices assigned jobs, and — once funded — generates a real
// deliverable via OpenRouter and submits it on-chain.
//
// Run:  node --env-file=agents/.env agents/provider-agent.mjs
import { zeroAddress, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  APPLICATIONS_ADDRESS,
  applicationsAbi,
  ERC8183_ADDRESS,
  erc8183Abi,
  jobCreatedEvent,
} from "./chain.mjs";
import { aiDoWorkOpenRouter, encodeDeliverable, getJob, log, makeClients, sleep, writeAndWait, JOB_STATUS } from "./lib.mjs";
import { priceJob } from "./pricing.mjs";
import { CLIENT_PERSONAS, PROVIDER_SPECIALTIES, randInt } from "./swarm-data.mjs";

const NUDGE_URL = "https://arcworkapp.vercel.app/api/nudge";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const CLIENT_ADDRESSES = CLIENT_PERSONAS.map((_, i) => process.env[`CLIENT_${i + 1}_PK`])
  .filter(Boolean)
  .map((pk) => privateKeyToAccount(pk).address);

// Same category keywords the client swarm's task pool was tagged with
// (agents/swarm-data.mjs) — matched against the description text since the
// on-chain job itself carries no category field.
function descriptionMatchesSpecialty(description, specialtyKey) {
  const d = description.toLowerCase();
  const rules = {
    smart_contract_dev: /python|solidity|smart contract|acceptance criteria|script that parses/,
    writer: /blog post|summariz|translate|user story|example job descriptions|business english/,
    data_specialist: /analy[sz]e|competitor|list \d+ job categories/,
    devops_engineer: /checklist|shell script|readme|test plan|qa /,
  };
  const re = rules[specialtyKey];
  return re ? re.test(d) : true;
}

async function runProvider(specialty, index) {
  const pk = process.env[`PROVIDER_${index + 1}_PK`];
  if (!pk) {
    log("provider", `skipping "${specialty.label}" — PROVIDER_${index + 1}_PK not set`);
    return;
  }
  const { account, pub, wallet } = makeClients(pk);
  const tag = `provider:${specialty.key}`;
  log(tag, `${specialty.label} online as ${account.address}`);

  const seen = new Set(); // every jobId we've ever applied to (never shrinks)
  const pending = new Set(); // applied, outcome not yet known (caps concurrent applications)
  const priced = new Set();
  const working = new Set(); // deliverable generation in flight or done — never re-enter
  const rejectStreak = new Map(); // client address -> consecutive rejections against us
  let lastScan = 0n;

  async function scanForOpenJobs() {
    const latest = await pub.getBlockNumber();
    const fromBlock = lastScan > 0n ? lastScan + 1n : latest > 9500n ? latest - 9500n : 1n;
    if (fromBlock > latest) return [];
    const jobs = [];
    for (const clientAddr of CLIENT_ADDRESSES) {
      const logs = await pub.getLogs({
        address: ERC8183_ADDRESS,
        event: jobCreatedEvent,
        args: { client: clientAddr },
        fromBlock,
        toBlock: latest,
      });
      for (const l of logs) if (l.args.jobId !== undefined) jobs.push(l.args.jobId);
    }
    lastScan = latest;
    return jobs;
  }

  async function tryApply(jobId) {
    const id = jobId.toString();
    if (seen.has(id)) return;
    if (pending.size >= 3) return; // at most 3 concurrent open applications
    const job = await getJob(pub, jobId);
    if (JOB_STATUS[job.status] !== "Open" || job.provider !== zeroAddress) return;
    const matches = specialty.key === "generalist" || descriptionMatchesSpecialty(job.description, specialty.key);
    if (!matches) return;
    const already = await pub.readContract({
      address: APPLICATIONS_ADDRESS,
      abi: applicationsAbi,
      functionName: "hasApplied",
      args: [jobId, account.address],
    });
    seen.add(id);
    if (already) {
      pending.add(id);
      return;
    }
    log(tag, `job #${jobId}: applying — "${job.description.slice(0, 60)}"`);
    await writeAndWait(pub, wallet, {
      address: APPLICATIONS_ADDRESS,
      abi: applicationsAbi,
      functionName: "applyToJob",
      args: [jobId],
    });
    pending.add(id);
  }

  // Fired once, without blocking the poll loop, so a 2-5 minute "work" sleep
  // on one job never stalls scanning/applying/pricing for the others.
  async function produceAndSubmit(jobId, job) {
    const id = jobId.toString();
    log(tag, `job #${jobId}: funded — producing deliverable…`);
    const streak = rejectStreak.get(job.client) ?? 0;
    let content = await aiDoWorkOpenRouter(job.description, specialty.label, OPENROUTER_API_KEY);
    if (streak >= 2) content = `Revised approach based on prior feedback.\n\n${content}`;
    await sleep(randInt(120, 300) * 1000); // simulate realistic work time
    const { deliverable, optParams } = encodeDeliverable(content);
    try {
      await writeAndWait(pub, wallet, {
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "submit",
        args: [jobId, deliverable, optParams],
      });
      log(tag, `job #${jobId}: submitted (${content.length} chars) — nudging the judge`);
      fetch(NUDGE_URL, { method: "POST" }).catch(() => {});
    } catch (e) {
      log(tag, `job #${jobId}: submit failed — ${String(e.shortMessage ?? e.message ?? e).slice(0, 120)}`);
      working.delete(id); // let a later poll retry
    }
  }

  async function handleAppliedJob(jobId) {
    const id = jobId.toString();
    const job = await getJob(pub, jobId);
    const status = JOB_STATUS[job.status];

    if (status === "Open" && job.provider !== zeroAddress && job.provider !== account.address) {
      pending.delete(id); // someone else got picked
      return;
    }

    if (status === "Open" && job.provider === account.address && job.budget === 0n && !priced.has(id)) {
      priced.add(id);
      pending.delete(id);
      const price = priceJob(job.description, { discount: specialty.discount });
      log(tag, `job #${jobId}: assigned to me — pricing at ${price} USDC`);
      await writeAndWait(pub, wallet, {
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "setBudget",
        args: [jobId, parseUnits(price, 6), "0x"],
      });
      return;
    }

    if (status === "Funded" && job.provider === account.address && !working.has(id)) {
      working.add(id);
      produceAndSubmit(jobId, job).catch((e) => log(tag, `job #${jobId}: deliverable error — ${e.message}`));
      return;
    }

    if (status === "Completed" && job.provider === account.address) {
      rejectStreak.set(job.client, 0);
      pending.delete(id);
      return;
    }
    if (status === "Rejected" && job.provider === account.address) {
      rejectStreak.set(job.client, (rejectStreak.get(job.client) ?? 0) + 1);
      pending.delete(id);
    }
  }

  while (true) {
    try {
      const newJobs = await scanForOpenJobs();
      for (const jobId of newJobs) await tryApply(jobId).catch((e) => log(tag, `apply error #${jobId}: ${e.message}`));
      for (const id of seen) await handleAppliedJob(BigInt(id)).catch((e) => log(tag, `handle error #${id}: ${e.message}`));
    } catch (e) {
      log(tag, `error: ${String(e.shortMessage ?? e.message ?? e).slice(0, 150)}`);
    }
    await sleep(randInt(15, 30) * 1000);
  }
}

log("provider-agent", `starting ${PROVIDER_SPECIALTIES.length} provider specialt(y/ies): ${PROVIDER_SPECIALTIES.map((p) => p.label).join(", ")}`);
await Promise.all(PROVIDER_SPECIALTIES.map(runProvider));
