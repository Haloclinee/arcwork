// Runs the entire arcwork judge roster (agents/judges.mjs) concurrently in
// one process — each judge is its own wallet + its own model, watching only
// the jobs assigned to it. No judge can see or influence another's verdict.
//
// Judging backend is picked once, globally, at startup:
//   - OPENROUTER_API_KEY set in agents/.env → every judge runs its
//     OpenRouter model (agents/judges.mjs `model` is an OpenRouter model ID)
//   - not set → falls back to a local Ollama model of the same name:
//       ollama pull llama3.1 && ollama pull deepseek-r1:8b && ...
//
// Run:  node --env-file=agents/.env agents/evaluator.mjs
import { stringToHex } from "viem";
import {
  ERC8183_ADDRESS,
  erc8183Abi,
  JOB_STATUS,
  aiEvaluateLocal,
  aiEvaluateOpenRouter,
  getJob,
  jobCreatedEvent,
  log,
  makeClients,
  recoverDeliverable,
  sleep,
  writeAndWait,
} from "./lib.mjs";
import { JUDGES } from "./judges.mjs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const evaluate = OPENROUTER_API_KEY
  ? (description, deliverable, model) => aiEvaluateOpenRouter(description, deliverable, model, OPENROUTER_API_KEY)
  : aiEvaluateLocal;

async function runJudge(judgeDef) {
  const pk = process.env[judgeDef.pkEnv];
  if (!pk) {
    log("evaluator", `skipping "${judgeDef.key}" — ${judgeDef.pkEnv} not set in agents/.env`);
    return;
  }
  const { account, pub, wallet } = makeClients(pk);
  const tag = `judge:${judgeDef.key}`;
  log(tag, `online as ${account.address} (${judgeDef.ansName}.arc, model: ${judgeDef.model})`);

  const judged = new Set();

  while (true) {
    try {
      const latest = await pub.getBlockNumber();
      const logs = await pub.getLogs({
        address: ERC8183_ADDRESS,
        event: jobCreatedEvent,
        args: { evaluator: account.address },
        fromBlock: latest > 9500n ? latest - 9500n : 1n,
        toBlock: latest,
      });
      for (const l of logs) {
        if (l.args.jobId === undefined) continue;
        const jobId = l.args.jobId;
        const id = jobId.toString();
        if (judged.has(id)) continue;
        const job = await getJob(pub, jobId);
        if (JOB_STATUS[job.status] !== "Submitted") continue;

        judged.add(id);
        log(tag, `job #${jobId}: submission ready — recovering deliverable…`);
        const recovered = await recoverDeliverable(pub, jobId, l.blockNumber);
        const content = recovered?.content;
        if (!content) {
          log(tag, `job #${jobId}: no on-chain content found — rejecting (cannot judge blind)`);
          await writeAndWait(pub, wallet, {
            address: ERC8183_ADDRESS,
            abi: erc8183Abi,
            functionName: "reject",
            args: [jobId, stringToHex("no-content", { size: 32 }), "0x"],
          });
          continue;
        }

        log(tag, `job #${jobId}: asking ${judgeDef.model} to judge…`);
        const verdict = await evaluate(job.description, content, judgeDef.model);
        log(tag, `job #${jobId}: verdict = ${verdict.approve ? "APPROVE" : "REJECT"} — "${verdict.reason}"`);

        const reasonHex = stringToHex(verdict.reason.slice(0, 31), { size: 32 });
        await writeAndWait(pub, wallet, {
          address: ERC8183_ADDRESS,
          abi: erc8183Abi,
          functionName: verdict.approve ? "complete" : "reject",
          args: [jobId, reasonHex, "0x"],
        });
        log(tag, `job #${jobId}: ${verdict.approve ? "payment released to provider" : "escrow refunded to client"} ✓`);
      }
    } catch (e) {
      log(tag, `error: ${String(e.shortMessage ?? e.message ?? e).slice(0, 120)}`);
    }
    await sleep(6000);
  }
}

log(
  "evaluator",
  `starting ${JUDGES.length} judge(s) via ${OPENROUTER_API_KEY ? "OpenRouter" : "local Ollama"}: ${JUDGES.map((j) => j.key).join(", ")}`,
);
await Promise.all(JUDGES.map(runJudge));
