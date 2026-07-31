// Runs all 5 CLIENT_PERSONAS (agents/swarm-data.mjs) concurrently, each its
// own wallet (CLIENT_1_PK..CLIENT_5_PK). Posts jobs open (no pinned
// provider), waits for applicants via the JobApplications companion
// contract, assigns one, reviews the provider's proposed budget against its
// own price estimate, funds or cancels, waits for the judge's verdict, pays
// the 1% platform fee (+ occasional tip), and loops.
//
// Run:  node --env-file=agents/.env agents/client-agent.mjs
import { zeroAddress, formatUnits, parseUnits, decodeEventLog, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { JUDGES } from "./judges.mjs";
import {
  APPLICATIONS_ADDRESS,
  applicationsAbi,
  ERC8183_ADDRESS,
  erc8183Abi,
  FEE_ADDRESS,
  feeAbi,
  jobCreatedEvent,
  TIPS_ADDRESS,
  tipsAbi,
  USDC_ADDRESS,
  erc20Abi,
} from "./chain.mjs";
import { getJob, log, makeClients, sleep, writeAndWait, JOB_STATUS } from "./lib.mjs";
import { priceJob } from "./pricing.mjs";
import { CLIENT_PERSONAS, TASK_POOL, shuffled, randInt } from "./swarm-data.mjs";

// createJob requires a real registered judge as evaluator — never
// zeroAddress, even for an open (unpinned-provider) job. Spread jobs across
// whichever of the 12 judges have a configured wallet.
const JUDGE_ADDRESSES = JUDGES.map((j) => process.env[j.pkEnv])
  .filter(Boolean)
  .map((pk) => privateKeyToAccount(pk).address);

const EXPIRY_SECONDS = { simple: 3600, complex: 86400 };

function isComplex(task) {
  return task.text.split(/\s+/).length > 20 || /audit|checklist|structured|test plan/i.test(task.text);
}

async function runClient(persona, index) {
  const pk = process.env[`CLIENT_${index + 1}_PK`];
  if (!pk) {
    log("client", `skipping "${persona.label}" — CLIENT_${index + 1}_PK not set`);
    return;
  }
  const { account, pub, wallet } = makeClients(pk);
  const tag = `client:${persona.key}`;
  log(tag, `${persona.label} online as ${account.address}`);

  let pool = shuffled(TASK_POOL);
  let poolIdx = 0;
  let lastCategory = null;
  const active = new Map(); // jobId(string) -> { stage, task, expectedPrice, appliedApplicantsSeen }

  function nextTask() {
    // Skip same-category-twice-in-a-row where possible.
    for (let tries = 0; tries < pool.length; tries++) {
      const candidate = pool[poolIdx % pool.length];
      poolIdx++;
      if (candidate.category !== lastCategory || pool.length === 1) {
        if (poolIdx >= pool.length * 2) pool = shuffled(TASK_POOL); // reshuffle occasionally
        lastCategory = candidate.category;
        return candidate;
      }
    }
    return pool[0];
  }

  async function postJob(task, note = "") {
    const complex = isComplex(task);
    const expiredAt = BigInt(Math.floor(Date.now() / 1000) + (complex ? EXPIRY_SECONDS.complex : EXPIRY_SECONDS.simple));
    const description = note ? `${task.text} ${note}` : task.text;
    log(tag, `posting job: ${description.slice(0, 90)}`);
    const receipt = await writeAndWait(pub, wallet, {
      address: ERC8183_ADDRESS,
      abi: erc8183Abi,
      functionName: "createJob",
      args: [zeroAddress, JUDGE_ADDRESSES[randInt(0, JUDGE_ADDRESSES.length - 1)], expiredAt, description, zeroAddress],
    });
    let jobId;
    for (const l of receipt.logs) {
      try {
        jobId = decodeEventLog({ abi: [jobCreatedEvent], ...l }).args.jobId;
        break;
      } catch {
        // not JobCreated
      }
    }
    if (jobId === undefined) return;
    log(tag, `job #${jobId} created (open, no pinned provider)`);
    active.set(jobId.toString(), { stage: "awaiting_applicants", task, category: task.category });
  }

  async function tick(jobIdStr, state) {
    const jobId = BigInt(jobIdStr);
    const job = await getJob(pub, jobId);
    const status = JOB_STATUS[job.status];

    if (status === "Open" && job.provider === zeroAddress) {
      const applicants = await pub.readContract({
        address: APPLICATIONS_ADDRESS,
        abi: applicationsAbi,
        functionName: "getApplicants",
        args: [jobId],
      });
      if (applicants.length > 0) {
        const chosen = applicants[randInt(0, applicants.length - 1)];
        log(tag, `job #${jobId}: ${applicants.length} applicant(s) — assigning ${chosen}`);
        await writeAndWait(pub, wallet, {
          address: ERC8183_ADDRESS,
          abi: erc8183Abi,
          functionName: "setProvider",
          args: [jobId, chosen],
        });
        state.stage = "awaiting_budget";
      }
      return;
    }

    if (status === "Open" && job.provider !== zeroAddress && job.budget === 0n) {
      state.stage = "awaiting_budget";
      return;
    }

    if (status === "Open" && job.budget > 0n) {
      const expected = Number(priceJob(job.description));
      const actual = Number(formatUnits(job.budget, 6));
      const diff = Math.abs(actual - expected) / expected;
      const myBalance = await pub.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      });
      if (diff <= 0.2 && myBalance < job.budget) {
        log(tag, `job #${jobId}: budget ${actual} USDC but only ${formatUnits(myBalance, 6)} USDC on hand — cancelling instead of retrying forever`);
        await writeAndWait(pub, wallet, {
          address: ERC8183_ADDRESS,
          abi: erc8183Abi,
          functionName: "reject",
          args: [jobId, stringToHex("insufficient funds", { size: 32 }), "0x"],
        });
        state.stage = "terminal";
        state.outcome = "cancelled (insufficient funds)";
      } else if (diff <= 0.2) {
        log(tag, `job #${jobId}: budget ${actual} USDC (expected ~${expected.toFixed(2)}) — within range, funding`);
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
        state.stage = "funded";
      } else {
        log(tag, `job #${jobId}: budget ${actual} USDC vs expected ~${expected.toFixed(2)} (${(diff * 100).toFixed(0)}% off) — cancelling`);
        await writeAndWait(pub, wallet, {
          address: ERC8183_ADDRESS,
          abi: erc8183Abi,
          functionName: "reject",
          args: [jobId, stringToHex("cancelled", { size: 32 }), "0x"],
        });
        state.stage = "terminal";
        state.outcome = "cancelled (budget mismatch)";
      }
      return;
    }

    if (status === "Funded") {
      state.stage = "waiting_submission";
      return;
    }

    if (status === "Submitted") {
      state.stage = "waiting_verdict";
      return;
    }

    if (status === "Completed") {
      log(tag, `job #${jobId}: COMPLETED — paying 1% platform fee to the judge`);
      const feeAmount = await pub.readContract({ address: FEE_ADDRESS, abi: feeAbi, functionName: "feeFor", args: [jobId] });
      await writeAndWait(pub, wallet, {
        address: FEE_ADDRESS,
        abi: feeAbi,
        functionName: "payFee",
        args: [jobId],
        value: feeAmount,
      });
      if (Math.random() < 0.5) {
        const tip = parseUnits((0.01 + Math.random() * 0.04).toFixed(4), 18);
        await writeAndWait(pub, wallet, { address: TIPS_ADDRESS, abi: tipsAbi, functionName: "tipJudge", args: [jobId], value: tip });
        log(tag, `job #${jobId}: tipped the judge — fair verdict`);
      }
      state.stage = "terminal";
      state.outcome = "completed";
      return;
    }

    if (status === "Rejected") {
      log(tag, `job #${jobId}: REJECTED — noting what went wrong, will repost a revised version in 2 minutes`);
      state.stage = "terminal";
      state.outcome = "rejected";
      state.revise = state.task;
    }
  }

  // Bootstrap: get up to 2 jobs in flight immediately at startup. Never lets
  // an error escape this function — one persona's failure must not take
  // down the others sharing this process's Promise.all.
  while (active.size < 2) {
    try {
      await postJob(nextTask());
    } catch (e) {
      log(tag, `post error: ${String(e.shortMessage ?? e.message ?? e).slice(0, 150)}`);
      await sleep(10_000);
    }
  }

  while (true) {
    try {
      for (const [jobIdStr, state] of [...active.entries()]) {
        if (state.stage === "terminal") continue;
        await tick(jobIdStr, state);
      }
      // New jobs are only ever queued here, on resolution — never inline in
      // the poll loop, or the 30-90s wait / 2-open-jobs cap gets violated by
      // firing both the scheduled post and an immediate one.
      for (const [jobIdStr, state] of [...active.entries()]) {
        if (state.stage !== "terminal") continue;
        active.delete(jobIdStr);
        if (state.revise) {
          const task = state.revise;
          sleep(120_000).then(() => postJob(task, "(revised based on prior feedback)")).catch((e) => log(tag, `revise-post error: ${e.message}`));
        } else {
          sleep(randInt(30, 90) * 1000).then(() => postJob(nextTask())).catch((e) => log(tag, `post error: ${e.message}`));
        }
      }
    } catch (e) {
      log(tag, `error: ${String(e.shortMessage ?? e.message ?? e).slice(0, 150)}`);
    }
    await sleep(10_000);
  }
}

log("client-agent", `starting ${CLIENT_PERSONAS.length} client persona(s): ${CLIENT_PERSONAS.map((p) => p.label).join(", ")}`);
await Promise.all(CLIENT_PERSONAS.map(runClient));
