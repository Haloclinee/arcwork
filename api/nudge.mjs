// Public, unauthenticated twin of api/evaluate.mjs — same single-pass
// judgeOnce() sweep over every judge, no CRON_SECRET required. The frontend
// fires this (no-await) right after a provider's submit() tx confirms, so
// most jobs get judged in seconds instead of waiting for the next 5-minute
// GitHub Actions run (.github/workflows/evaluate.yml), which still runs on
// its own schedule as a safety net for anything this misses.
//
// Safe to leave open: the only real work (an OpenRouter call + an on-chain
// write) happens per judge only while a job assigned to it is genuinely
// "Submitted" — once judged, the job moves out of that status, so repeated
// or spammed calls degrade to cheap read-only no-ops.
import { aiEvaluateLocal, aiEvaluateOpenRouter, judgeOnce } from "../agents/lib.mjs";
import { JUDGES } from "../agents/judges.mjs";

export default async function handler(req, res) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const evaluate = openRouterKey
    ? (description, deliverable, model) => aiEvaluateOpenRouter(description, deliverable, model, openRouterKey)
    : aiEvaluateLocal;

  const results = await Promise.all(
    JUDGES.map(async (j) => {
      try {
        return await judgeOnce(j, evaluate);
      } catch (e) {
        return { key: j.key, error: String(e.shortMessage ?? e.message ?? e).slice(0, 200) };
      }
    }),
  );

  res.status(200).json({ at: new Date().toISOString(), results });
}
