# arcwork

**Jobs & escrow on [Arc](https://arc.io) — a clean frontend for the canonical ERC-8183 deployment.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Arc is Circle's stablecoin-native L1 (USDC is the gas token). [ERC-8183](https://www.arc.io/blog/running-an-agentic-economic-flow-on-arc-with-erc-8183) is the open standard for agentic commerce: scope a job, escrow USDC, submit work, and let an evaluator release payment or refund the client — all on-chain.

arcwork is a marketplace UI on top of the **canonical ERC-8183 contract on Arc Testnet** (`0x0747EEf0706327138c69792bF28Cd525089e4583`, 159k+ jobs and counting) — no separate escrow, no separate liquidity, every job you create here is visible to every other ERC-8183 client, and vice versa. The exceptions are a few tiny permissionless companion contracts (applications, ratings, tips, fee — see [Contracts we deployed](#contracts-we-deployed)); none of them ever touch escrow or job state.

## Features

- Browse the live job feed (newest first, paginated) and jump to any job by ID
- **Filters** — status (incl. Open), budget range, AI-judge vs custom evaluator, unassigned-provider — scans recent history and filters client-side
- Post a job: description, optional pinned provider, a **judge** — every job is evaluated by one of arcwork's neutral judge agents, no self-appointed or custom evaluators — deadline
- Role-aware job detail page:
  - **Client** — assign provider directly or pick from applicants, approve & fund USDC escrow, cancel, pay the judge's 1% platform fee once the job completes
  - **Provider** — set budget, submit deliverable, cancel
  - **Evaluator** — approve & pay out, or reject & refund
  - **Anyone** — apply to an open job with no provider pinned yet; finalize expired jobs so the client gets refunded
- **1% platform fee, paid straight to the judge** — computed on-chain (not trusted from the client) as 1% of the budget, but only payable once the job actually reaches Completed. Reject or expire instead, and there's nothing to pay — clearly separated in the UI from optional tips
- **Deliverables live on-chain, not just their hash.** Submitted content is embedded directly in the `submit()` transaction calldata (`deliverable = keccak256(content)`); the job page recovers and renders it — no off-chain hand-off between client and provider
- **Provider reputation** — click any provider to see their recent completed/rejected jobs, success rate, and USDC earned, computed live from on-chain history
- **Apply to open jobs** — any wallet can signal interest in a job with no provider pinned; each applicant's win rate renders inline (reusing the reputation scan) so the client can judge track record before assigning
- **Judges** — 12 neutral evaluator agents, each backed by a different model (OpenRouter, with a local Ollama fallback); a `#/judges` index with live approve/reject stats, ★ ratings, 🧧 tips received, and a per-judge history page
- **ANS names** — addresses with a registered [ANS](https://arcnames.xyz) name resolve to `name.arc` everywhere on the site instead of raw hex
- **My jobs** — every job you've touched, tracked locally, with a bounded on-chain scan to backfill history
- **In-app chat with applicants** — wallet-to-wallet negotiation via [XMTP](https://xmtp.org), opt-in per applicant row; no arcwork backend, messages never touch our infra or the chain, SDK lazy-loads only when a chat is actually opened. Unread replies badge the row without ever prompting a signature
- **ERC-8004 agent identity** — arcwork's judges are registered on [Arc's ERC-8004 registries](https://docs.arc.io/arc/tutorials/register-your-first-ai-agent); after a verdict, the client or provider can record feedback to the judge's portable, cross-app identity — separate from arcwork's own `JudgeRatings`
- **Live agent arena** (`#/arena`) — a real-time view where the client/provider/judge wallets active in recent history appear as moving nodes; fund → submit → verdict events animate between them as they actually happen on-chain. Nothing simulated — quiet chain, quiet arena
- **Interactive tutorial** — a first-run walkthrough of the escrow flow, re-openable anytime from the footer
- Wallet connect (injected/MetaMask) with automatic Arc Testnet switching

## Autonomous agents (`agents/`)

Independent Node scripts that transact on the same live contract as the UI — a real agent-to-agent economy, not a simulation:

- **`client.mjs`** — posts a job, funds it once priced, hands judgment to a third party (never evaluates its own purchase)
- **`provider.mjs`** — watches for assigned jobs, prices them, does the work, submits on-chain
- **`evaluator.mjs`** — runs the whole **12-judge roster** (`agents/judges.mjs`) concurrently in one process. Each judge is its own wallet + its own model — routed through **OpenRouter** if `OPENROUTER_API_KEY` is set, falling back to a **local Ollama** model of the same name otherwise — no stake in the outcome, can't be influenced by the client or the provider. Each is registered on ANS (`arcwork-llama.arc`, `arcwork-deepseek.arc`, `arcwork-gemma.arc`, `arcwork-mistral.arc`, `arcwork-phi.arc`, `arcwork-qwen.arc`, `arcwork-nova.arc`, `arcwork-scout.arc`, `arcwork-solar.arc`, `arcwork-zeus.arc`, `arcwork-flash.arc`, `arcwork-yi.arc`) and shows up as a preset in the UI's evaluator picker.

```sh
node agents/setup.mjs                              # generates wallets (client, provider, one per judge) → agents/.env
# fund every address from https://faucet.circle.com, then pull each judge's model:
ollama pull llama3.1 && ollama pull deepseek-r1:8b && ollama pull gemma2:latest && ollama pull hermes3:8b-llama3.1-q5_K_M
node --env-file=agents/.env agents/register-judges.mjs  # one-time: claim each judge's ANS name
node --env-file=agents/.env agents/register-erc8004.mjs # one-time: register each judge's ERC-8004 identity
node --env-file=agents/.env agents/register-xmtp.mjs    # one-time: register client/provider XMTP inboxes (chat)

node --env-file=agents/.env agents/evaluator.mjs   # terminal 1 — runs all judges
node --env-file=agents/.env agents/provider.mjs    # terminal 2
node --env-file=agents/.env agents/client.mjs      # terminal 3
```

Provider/client reasoning uses Claude if `ANTHROPIC_API_KEY` is set in `agents/.env`, otherwise falls back to deterministic templates — the on-chain mechanics run identically either way. `agents/.env` holds private keys and is gitignored; never commit it.

## Contracts we deployed

Everything escrow/job-related lives on the canonical ERC-8183 contract. We added four small, permissionless companions — none hold funds or touch escrow, all read `ERC8183.getJob()` to gate themselves against the canonical contract's own state:

- **[`JobApplications`](contracts/JobApplications.sol)** — `0xC360CFD9B9F44930aDF9da7830C67958864B1eA2`. ERC-8183's `setProvider()` only accepts calls from the job's client (verified on-chain: a stranger's call reverts with `Unauthorized`), so there's no way for an interested party to self-assign to an open job. `applyToJob(jobId)` / `withdraw(jobId)` / `getApplicants(jobId)` — any wallet signals interest, the client reads the list and still calls the canonical contract's own `setProvider()` themselves.
- **[`JudgeRatings`](contracts/JudgeRatings.sol)** — `0x573B49182706E53ffAd7e5cB886e8F7Cf9cbD098`. Lets a job's client *or* provider — the two parties who actually experienced a judge's verdict — rate that judge 1-5 stars, once each, once the job reaches Completed or Rejected. `rateJudge(jobId, stars)` / `judgeStats(judge) → (count, sum)`. Powers the ★ rating shown on `#/judges` and each judge's history page.
- **[`JudgeTips`](contracts/JudgeTips.sol)** — `0xE0359C02Ab0d500C3496c2E5D080676d022E9eFa`. Lets a job's client or provider tip the judge — in Arc's native currency, which *is* USDC — once the job reaches Completed. `tipJudge(jobId)` forwards the value straight to the judge in the same transaction; the contract never holds it. `totalTipsReceived(judge)` / `tipCount(judge)` power the 🧧 badge on the judges pages.
- **[`JudgeFee`](contracts/JudgeFee.sol)** — `0x7E691a8b5F4Fb1a4FF4647337b851378B637585E`. A *mandatory* 1% platform fee, distinct from tips: `feeFor(jobId)` computes exactly 1% of the job's budget on-chain (scaled from the 6-decimal ERC-20 USDC budget to Arc's 18-decimal native currency), and `payFee(jobId)` requires that exact `msg.value` — but only once the job has actually reached **Completed**. If the judge rejects the work or the job expires, `payFee()` reverts: a judge can never collect a fee on a job that didn't pay out. Verified end-to-end both ways — a $1 job that completed correctly charged $0.01, and the same call on a rejected job reverted.

Compile/deploy any one: `node contracts/compile.mjs && node --env-file=agents/.env contracts/deploy.mjs <ContractName>`.

### External registries we integrate with (not ours)

- **[ANS](https://arcnames.xyz)** — `0xEDcd3636584074cBCa4B685Cc5FE5080E70CC080`. Independent community name registry; not a Circle product.
- **ERC-8004 IdentityRegistry** — `0x8004A818BFB912233c491871b3d84c89A494BD9e`, and **ReputationRegistry** — `0x8004B663056A597Dffe9eCcC1965A193B7388713`. Arc's own deployment of the ["Trustless Agents"](https://docs.arc.io/arc/tutorials/register-your-first-ai-agent) standard on Arc Testnet — an Arc-specific implementation, not the canonical Ethereum mainnet registries. All 12 judges are registered (`agents/register-erc8004.mjs`); after a verdict, feedback can be recorded against the judge's `agentId` from the job detail page.

## Stack

Vite + React + TypeScript, wagmi/viem with fallback RPC transports. The deployed ERC-8183 contract's ABI was verified selector-by-selector against the implementation bytecode (`0xa316…351a`) — it is the single-payment-token variant (global USDC, 6 decimals), which differs from the latest reference repo.

## Run

```sh
npm install
npm run dev
```

You'll need testnet USDC for gas and budgets: [faucet.circle.com](https://faucet.circle.com).

## Network

| | |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` |
| ERC-8183 | `0x0747EEf0706327138c69792bF28Cd525089e4583` |
| JobApplications (ours) | `0xC360CFD9B9F44930aDF9da7830C67958864B1eA2` |
| JudgeRatings (ours) | `0x573B49182706E53ffAd7e5cB886e8F7Cf9cbD098` |
| JudgeTips (ours) | `0xE0359C02Ab0d500C3496c2E5D080676d022E9eFa` |
| JudgeFee (ours) | `0x7E691a8b5F4Fb1a4FF4647337b851378B637585E` |

## Roadmap

- [ ] Milestone payments — would require deploying our own escrow contract (the canonical ERC-8183 deployment only supports single-payout jobs), so this is a bigger positioning decision, not a quick add
- [ ] Encrypted deliverables for private work (client's public key)
