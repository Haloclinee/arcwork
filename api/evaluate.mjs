// Stateless judging endpoint — runs one judgeOnce() pass (agents/lib.mjs)
// per judge in agents/judges.mjs, then returns. Meant to be hit on a
// schedule by something outside Vercel (see .github/workflows/evaluate.yml,
// since Vercel's own Cron Jobs only run once a day on the Hobby plan — far
// too slow for a job marketplace). No always-on process required.
//
// Auth: requires `Authorization: Bearer <CRON_SECRET>` — set CRON_SECRET in
// Vercel's project env vars and in the GitHub Actions secret of the same name.
import { aiEvaluateLocal, aiEvaluateOpenRouter, judgeOnce } from "../agents/lib.mjs";
import { JUDGES } from "../agents/judges.mjs";

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

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

  res.status(200).json({
    backend: openRouterKey ? "openrouter" : "ollama",
    at: new Date().toISOString(),
    results,
  });
}
