// Runs the entire arcwork judge roster (agents/judges.mjs) concurrently in
// one long-lived process — each judge is its own wallet + its own model,
// looping judgeOnce() (agents/lib.mjs) on a fixed interval. For a stateless,
// cron-triggered alternative (no always-on process required), see
// api/evaluate.mjs, which runs the same judgeOnce() pass a single time.
//
// Judging backend is picked once, globally, at startup:
//   - OPENROUTER_API_KEY set in agents/.env → every judge runs its
//     OpenRouter model (agents/judges.mjs `model` is an OpenRouter model ID)
//   - not set → falls back to a local Ollama model of the same name:
//       ollama pull llama3.1 && ollama pull deepseek-r1:8b && ...
//
// Run:  node --env-file=agents/.env agents/evaluator.mjs
import { aiEvaluateLocal, aiEvaluateOpenRouter, judgeOnce, log, sleep } from "./lib.mjs";
import { JUDGES } from "./judges.mjs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const evaluate = OPENROUTER_API_KEY
  ? (description, deliverable, model) => aiEvaluateOpenRouter(description, deliverable, model, OPENROUTER_API_KEY)
  : aiEvaluateLocal;

async function runJudge(judgeDef) {
  while (true) {
    try {
      const result = await judgeOnce(judgeDef, evaluate);
      if (result.skipped) {
        log("evaluator", `skipping "${judgeDef.key}" — ${result.skipped}`);
        return;
      }
    } catch (e) {
      log(`judge:${judgeDef.key}`, `error: ${String(e.shortMessage ?? e.message ?? e).slice(0, 120)}`);
    }
    await sleep(6000);
  }
}

log(
  "evaluator",
  `starting ${JUDGES.length} judge(s) via ${OPENROUTER_API_KEY ? "OpenRouter" : "local Ollama"}: ${JUDGES.map((j) => j.key).join(", ")}`,
);
await Promise.all(JUDGES.map(runJudge));
