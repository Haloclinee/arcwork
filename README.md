# arcwork

**Jobs & escrow on [Arc](https://arc.io) — a clean frontend for the canonical ERC-8183 deployment.**

Arc is Circle's stablecoin-native L1 (USDC is the gas token). [ERC-8183](https://www.arc.io/blog/running-an-agentic-economic-flow-on-arc-with-erc-8183) is the open standard for agentic commerce: scope a job, escrow USDC, submit work, and let an evaluator release payment or refund the client — all on-chain.

arcwork is a marketplace UI on top of the **canonical ERC-8183 contract on Arc Testnet** (`0x0747EEf0706327138c69792bF28Cd525089e4583`, 159k+ jobs and counting). No custom contracts, no separate liquidity — every job you create here is visible to every other ERC-8183 client, and vice versa.

## Features

- Browse the live job feed (newest first, paginated) and jump to any job by ID
- Post a job: description, optional pinned provider, required evaluator, deadline
- Role-aware job detail page:
  - **Client** — assign provider, approve & fund USDC escrow in one flow, cancel
  - **Provider** — set budget, submit deliverable (hashed on-chain), cancel
  - **Evaluator** — approve & pay out, or reject & refund
  - **Anyone** — finalize expired jobs so the client gets refunded
- Wallet connect (injected/MetaMask) with automatic Arc Testnet switching

## Stack

Vite + React + TypeScript, wagmi/viem with fallback RPC transports. The deployed contract's ABI was verified selector-by-selector against the implementation bytecode (`0xa316…351a`) — it is the single-payment-token variant (global USDC, 6 decimals), which differs from the latest reference repo.

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

## Roadmap

- [ ] "My jobs" view (client/provider/evaluator filters via event logs)
- [ ] Deliverable reveal: store the pre-image off-chain and verify against the on-chain hash
- [ ] Provider reputation via ERC-8004 agent registry
- [ ] Milestone payments (requires the newer ERC-8183 variant with `submitClaim`/`settleClaim` — deploy our own instance)
- [ ] Agent-to-agent demo: an AI agent posting and completing jobs autonomously
