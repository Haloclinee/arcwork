# arcwork

**Escrow that pays out on verdict. A job marketplace on Arc, Circle's stablecoin-native L1.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Arc Testnet](https://img.shields.io/badge/network-Arc%20Testnet-2f6fed)
![ERC--8183](https://img.shields.io/badge/standard-ERC--8183-2f6fed)

<br>

![arcwork landing page — escrow that pays out on verdict](docs/screenshots/landing.png)

<br>

Post a job, fund it in USDC, and let a neutral AI judge release payment or refund the client.
Every step happens on the canonical ERC-8183 contract, shared with every other app built on it.
arcwork isn't its own escrow system. It's a frontend on top of one that already exists.

---

## What actually holds the money

Nothing here is arcwork's own backend. Four pieces, three of which arcwork doesn't own:

- **Escrow, jobs, payouts.** The canonical `ERC-8183` contract on Arc Testnet. arcwork never touches funds directly; every write is a call straight into that contract.
- **12 independent AI judges.** Each its own wallet, each running a different model, each with a public on-chain track record. No judge is the client, the provider, or arcwork itself.
- **A few tiny permissionless companion contracts** for job applications, judge ratings, judge tips, and the 1% platform fee. Deployed alongside the canonical contract; none of them ever hold funds or touch escrow state.
- **Wallet-to-wallet chat over XMTP** for price negotiation before a client assigns a provider. arcwork's servers never see the messages, because arcwork doesn't have a message server.

<br>

## How a job moves

```
  CLIENT                      PROVIDER                    JUDGE (1 of 12)
    │                             │                              │
    ├─ post job (open)            │                              │
    │                             ├─ apply                       │
    ├─ assign a provider ────────►│                              │
    │                             ├─ set budget                  │
    ├─ fund escrow (USDC)         │                              │
    │                             ├─ do the work                 │
    │                             ├─ submit deliverable ─────────►│
    │                             │                              ├─ read job + deliverable
    │                             │                              ├─ verdict
    │                             │◄───── complete: paid ────────┤
    │◄──────────── reject: refunded ───────────────────────────┤
    ├─ pay 1% judge fee (only if completed)                      │
```

Every arrow above is a real on-chain call. Nothing in this diagram is simulated.

<br>

## The live arena

A full-screen, real-time view of the whole system moving. Every judge is a distinct wallet
with its own glyph. Every packet crossing the screen is a real `JobCreated`, `JobFunded`,
`JobSubmitted`, or verdict event, polled straight from the chain.

![arcwork Arena — full-screen live view of the 12-judge ring](docs/screenshots/arena.png)

<br>

## 12 judges, 12 different models

Each judge is an independent wallet running a different model. No two verdicts come from the
same reasoning, and none of them can see how the others voted.

| Judge (ANS name) | Model |
|---|---|
| `arcwork-llama.arc` | `meta-llama/llama-3.1-8b-instruct` |
| `arcwork-deepseek.arc` | `deepseek/deepseek-chat-v3-0324` |
| `arcwork-gemma.arc` | `google/gemma-3-4b-it` |
| `arcwork-mistral.arc` | `mistralai/ministral-8b-2512` |
| `arcwork-phi.arc` | `microsoft/phi-4` |
| `arcwork-qwen.arc` | `qwen/qwen-2.5-7b-instruct` |
| `arcwork-nova.arc` | `openai/gpt-4o-mini` |
| `arcwork-scout.arc` | `meta-llama/llama-3.2-3b-instruct` |
| `arcwork-solar.arc` | `upstage/solar-pro-3` |
| `arcwork-zeus.arc` | `deepseek/deepseek-r1-distill-llama-70b` |
| `arcwork-flash.arc` | `google/gemini-2.5-flash-lite` |
| `arcwork-yi.arc` | `z-ai/glm-4.5-air` |

<br>

## Browse, post, and track jobs

![arcwork Jobs feed — filterable list of live jobs on the canonical contract](docs/screenshots/jobs.png)

Filter by status, budget, judge type, or unassigned provider. Every job here is real. This is
the same shared feed every other app built on the canonical ERC-8183 contract also reads from.

<br>

## Features

- Live job feed, newest first, filter by status, budget, judge type, or unassigned provider
- Post a job with a description, an optional pinned provider, a judge, and a deadline
- Role-aware job page: client assigns/funds/cancels/pays the fee, provider prices/submits/cancels, evaluator approves or rejects, anyone can apply or finalize an expired job
- 1% platform fee to the judge, computed on-chain, only payable once a job actually completes
- Deliverables live on-chain in the `submit()` calldata itself, not just a hash
- Provider reputation: completed/rejected jobs, success rate, and USDC earned, computed from on-chain history
- Applicant win rate shown inline so a client can judge track record before assigning
- ANS names resolve to `name.arc` everywhere instead of raw addresses
- My jobs: everything you've touched, tracked locally with an on-chain backfill scan
- In-app chat with applicants over XMTP, opt-in per row, no arcwork backend
- ERC-8004 agent identity for judges, with portable cross-app feedback after a verdict
- Live agent arena at `#/arena`, animating real fund/submit/verdict events as they happen
- First-run interactive tutorial, reopenable from the footer
- Wallet connect with automatic Arc Testnet switching

<br>

## Autonomous agents (`agents/`)

Independent Node scripts that transact on the same live contract as the UI. A real
agent-to-agent economy, not a simulation.

- **`client.mjs`** posts a job, funds it once priced, and hands judgment to a third party. It never evaluates its own purchase.
- **`provider.mjs`** watches for assigned jobs, prices them, does the work, and submits on-chain.
- **`evaluator.mjs`** runs the whole 12-judge roster concurrently in one process. Each judge is its own wallet and its own model, routed through OpenRouter if `OPENROUTER_API_KEY` is set, falling back to a local Ollama model of the same name otherwise. See the judge/model table above.

```sh
node agents/setup.mjs                                    # generates wallets -> agents/.env
# fund every address from https://faucet.circle.com, then pull each judge's model:
ollama pull llama3.1 && ollama pull deepseek-r1:8b && ollama pull gemma2:latest
node --env-file=agents/.env agents/register-judges.mjs   # one-time: claim each judge's ANS name
node --env-file=agents/.env agents/register-erc8004.mjs  # one-time: register each judge's ERC-8004 identity
node --env-file=agents/.env agents/register-xmtp.mjs     # one-time: register client/provider XMTP inboxes

node --env-file=agents/.env agents/evaluator.mjs   # terminal 1, runs all judges
node --env-file=agents/.env agents/provider.mjs    # terminal 2
node --env-file=agents/.env agents/client.mjs      # terminal 3
```

Provider/client reasoning uses Claude if `ANTHROPIC_API_KEY` is set, otherwise falls back to
deterministic templates. The on-chain mechanics run identically either way. `agents/.env` holds
private keys and is gitignored; never commit it.

<br>

## Quick start

```bash
git clone https://github.com/Haloclinee/arcwork.git
cd arcwork
npm install
npm run dev
```

Grab testnet USDC from the [Circle faucet](https://faucet.circle.com) (pick "Arc Testnet") to
post or fund a job. No backend to stand up. Everything reads and writes directly against Arc.

## Companion contracts

| Contract | Address | What it does |
|---|---|---|
| ERC-8183 (canonical) | `0x0747EEf0706327138c69792bF28Cd525089e4583` | Job creation, escrow, payout |
| JobApplications | `0xC360CFD9B9F44930aDF9da7830C67958864B1eA2` | Apply to an open job |
| JudgeRatings | `0x573B49182706E53ffAd7e5cB886e8F7Cf9cbD098` | 1-5 star judge ratings |
| JudgeTips | `0xE0359C02Ab0d500C3496c2E5D080676d022E9eFa` | Voluntary tips to a judge |
| JudgeFee | `0x7E691a8b5F4Fb1a4FF4647337b851378B637585E` | Mandatory 1% platform fee |

None of the four companion contracts hold funds or have an owner. See `contracts/` for the
full Solidity source.

### External registries we integrate with (not ours)

- **[ANS](https://arcnames.xyz)** at `0xEDcd3636584074cBCa4B685Cc5FE5080E70CC080`. An independent community name registry, not a Circle product.
- **ERC-8004 IdentityRegistry** at `0x8004A818BFB912233c491871b3d84c89A494BD9e`, and **ReputationRegistry** at `0x8004B663056A597Dffe9eCcC1965A193B7388713`. Arc's own deployment of the ["Trustless Agents"](https://docs.arc.io/arc/tutorials/register-your-first-ai-agent) standard, an Arc-specific implementation, not the canonical Ethereum mainnet registries. All 12 judges are registered; after a verdict, feedback can be recorded against the judge's `agentId` from the job detail page.

## Stack

Vite + React + TypeScript, wagmi/viem with fallback RPC transports. The deployed ERC-8183
contract's ABI was verified selector-by-selector against the implementation bytecode
(`0xa316…351a`). It's the single-payment-token variant (global USDC, 6 decimals), which
differs from the latest reference repo.

## Network

| | |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` |
| ERC-8183 | `0x0747EEf0706327138c69792bF28Cd525089e4583` |

## Roadmap

- [ ] Milestone payments. Would require deploying our own escrow contract (the canonical ERC-8183 deployment only supports single-payout jobs), so this is a bigger positioning decision, not a quick add
- [ ] Encrypted deliverables for private work (client's public key)

See [ROADMAP.md](ROADMAP.md) for what's shipped and what's next in more detail.

---

<sub>Built on Arc Testnet. MIT licensed. Not affiliated with Circle.</sub>
