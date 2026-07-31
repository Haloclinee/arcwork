# Roadmap

## 12-judge expansion (OpenRouter) — shipped

Moved judges off a single local Ollama model each and onto a roster of 12 distinct
OpenRouter-backed personas (falling back to a local Ollama model of the same name if
`OPENROUTER_API_KEY` isn't set). See `agents/judges.mjs` for the live roster.

A few model IDs from the original plan had been deprecated/renamed on OpenRouter by the time
this shipped, so the final roster substitutes the closest available equivalent, verified against
a real OpenRouter call before going live:

| ANS | Model (as shipped) | Character |
|---|---|---|
| arcwork-llama | `meta-llama/llama-3.1-8b-instruct` | General-purpose, balanced |
| arcwork-deepseek | `deepseek/deepseek-chat-v3-0324` | Reasoning, thinks step by step |
| arcwork-gemma | `google/gemma-3-4b-it` | Fast, lightweight |
| arcwork-mistral | `mistralai/ministral-8b-2512` | Literal, criteria-focused |
| arcwork-phi | `microsoft/phi-4` | Small but strong reasoning |
| arcwork-qwen | `qwen/qwen-2.5-7b-instruct` | Multilingual, technical work |
| arcwork-nova | `openai/gpt-4o-mini` | Reliable, consistent |
| arcwork-scout | `meta-llama/llama-3.2-3b-instruct` | Ultra-fast, simple jobs |
| arcwork-solar | `upstage/solar-pro-3` | Instruction-following focused |
| arcwork-zeus | `deepseek/deepseek-r1-distill-llama-70b` | Heavy reasoning, slowest |
| arcwork-flash | `google/gemini-2.5-flash-lite` | Very fast, cheap |
| arcwork-yi | `z-ai/glm-4.5-air` | Detailed analysis, long context |

Code: `agents/judges.mjs` (roster), `agents/lib.mjs` (`aiEvaluateOpenRouter`, alongside the
existing `aiEvaluateLocal`), `agents/evaluator.mjs` (picks OpenRouter vs Ollama based on
`OPENROUTER_API_KEY`), `agents/setup.mjs` (`.env` template), `src/lib/presets.ts` (addresses +
ERC-8004 `agentId`s from the live registration).

## Arena — full-screen, gamified live view

Not started. The `#/arena` page (`src/pages/ArenaPage.tsx`) currently animates small dots
drifting between client/judge nodes on a canvas embedded in the normal page layout
(`.arena-canvas-wrap`, `ArenaNode` with `orbitTarget` drift toward the live vault/judge
position). It works but reads as a small decorative widget, not a place worth watching.

Direction to take it:
- **Full-screen mode** — a dedicated, chrome-free view (own route or a fullscreen toggle on
  `#/arena`) so the canvas is the whole viewport, not a card competing with page padding.
- **Per-agent icons** — replace the plain colored dots with small distinct icons/avatars per
  judge and per client/provider role, so a viewer can actually tell agents apart at a glance
  instead of reading the label underneath.
- **Legible, game-like motion** — current drift is functional but not eye-trackable as an
  event; redesign the fund → submit → verdict beats as clear, readable motion (a distinct
  travel/arrival/pulse per event) rather than ambient wander, closer to how a live dashboard
  or simple game reads at a glance.
- Re-run the **hallmark** skill (already used for the site's Cobalt redesign) specifically
  against this page — it was invoked broadly for the whole-site redesign earlier, not with
  Arena's full-screen/gamified motion as the explicit brief, so its motion/hierarchy guidance
  hasn't actually been applied here yet.

## Multi-agent swarm demo — see `docs/experiments/`

A 5-client / 5-provider autonomous swarm (`agents/client-agent.mjs`, `agents/provider-agent.mjs`)
exists and was run once end-to-end on Arc Testnet — see `docs/experiments/2026-07-31-swarm-run.md`
for the results. Re-running it just needs the swarm wallets refunded (they drain client-side
USDC quickly since job budgets recycle one-way from client to provider).
