# Roadmap

Planned work, not yet implemented. Notes here are a spec for future sessions, not a promise of a ship date.

## 12-judge expansion (OpenRouter)

Move judges off a single local Ollama model each and onto a roster of 12 distinct OpenRouter-backed
personas — more variety in verdict style, and no dependency on a local model server for evaluation.

### Judges

**Existing 4 (model swap, same ANS pattern, new names)**

| Old ANS | New ANS | Model | Character |
|---|---|---|---|
| arcwork-judge | arcwork-llama | `meta-llama/llama-3.1-8b-instruct` | General-purpose, balanced |
| arcwork-sage | arcwork-deepseek | `deepseek/deepseek-chat-v3-0324` | Reasoning, thinks step by step |
| arcwork-swift | arcwork-gemma | `google/gemma-2-9b-it` | Fast, lightweight |
| arcwork-hermes | arcwork-mistral | `mistralai/mistral-7b-instruct` | Literal, criteria-focused |

**New 8**

| ANS | Model | Character |
|---|---|---|
| arcwork-phi | `microsoft/phi-4-mini-instruct` | Small but strong reasoning |
| arcwork-qwen | `qwen/qwen-2.5-7b-instruct` | Multilingual, technical work |
| arcwork-nova | `openai/gpt-4o-mini` | Reliable, consistent |
| arcwork-scout | `meta-llama/llama-3.2-3b-instruct` | Ultra-fast, simple jobs |
| arcwork-solar | `upstage/solar-mini` | Instruction-following focused |
| arcwork-zeus | `deepseek/deepseek-r1-distill-llama-8b` | Heavy reasoning, slowest |
| arcwork-flash | `google/gemini-2.0-flash-lite-001` | Very fast, cheap |
| arcwork-yi | `01-ai/yi-large` | Detailed analysis, long context |

### Code changes

- **`agents/judges.mjs`** — update 4 existing entries (`model` + `ansName`), add 8 new entries.
  `model` becomes an OpenRouter model ID instead of an Ollama model name. Each judge gets a
  `pkEnv` (`EVALUATOR_PHI_PK`, `EVALUATOR_QWEN_PK`, etc.).
- **`agents/lib.mjs`** — add `aiEvaluateOpenRouter()` alongside the existing `aiEvaluateLocal()`
  (Ollama). Same prompt, different endpoint (`https://openrouter.ai/api/v1/chat/completions`).
  `evaluator.mjs` uses OpenRouter when `OPENROUTER_API_KEY` is set, falls back to Ollama otherwise.
- **`src/lib/presets.ts`** — add the 8 new presets. Addresses get filled in after running
  `agents/setup.mjs` (wallet generation).
- **`agents/setup.mjs`** — add an `OPENROUTER_API_KEY=` line to the `.env` template.
